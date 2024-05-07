import { createFactory } from 'hono/factory';
import { extractAmount, hexToBytes, isBountyComment } from './utils';
import { addBountyToNotion } from './notion';
import TwitterAPI from 'twitter-api-v2';
import twitterStore from './twitter/twitterStore';
import { tweetBounty } from './twitter';
const encoder = new TextEncoder();

const factory = createFactory();

// Check if the request is coming from GitHub webhook
export const checkGhSignature = factory.createMiddleware(async (c, next) => {
  try {
    const ghWebhookSecret = c.env.GITHUB_WEBHOOK_SECRET;
    const sigHex = c.req.header()['x-hub-signature-256'].split('=')[1];
    const algorithm = { name: 'HMAC', hash: { name: 'SHA-256' } };
    const keyBytes = encoder.encode(ghWebhookSecret);
    const extractable = false;
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      algorithm,
      extractable,
      ['sign', 'verify']
    );
    const sigBytes = hexToBytes(sigHex);
    const dataBytes = encoder.encode(JSON.stringify(await c.req.json()));
    const equal = await crypto.subtle.verify(
      algorithm.name,
      key,
      sigBytes,
      dataBytes
    );

    if (!equal) c.set('error', 'unauthorized');

    return await next();
  } catch (e) {
    console.log(e);
    c.set('error', 'unauthorized');
    return await next();
  }
});

export const webhookHandler = factory.createHandlers(
  checkGhSignature,
  async (c) => {
    try {
      const adminUsernames: string[] = c.env.ADMIN_USERNAMES.split(',');
      const notionDatabaseId = c.env.NOTION_DATABASE_ID;
      const notionApiKey = c.env.NOTION_API_KEY;
      if (c.var.error) return c.status(401);

      const body = await c.req.json();
      const username = body.sender.login;
      const message = body.comment.body;
      const author = body.issue.user.login;

      if (
        !isBountyComment(message) ||
        !adminUsernames.find((adminUsername) => adminUsername === username)
      ) {
        c.status(200);
        return c.json({ message: 'Not a bounty comment' });
      }

      const bountyAmount = extractAmount(message);
      if (!bountyAmount) return c.status(200);

      await addBountyToNotion({
        username: author,
        amount: bountyAmount,
        notion: {
          apiKey: notionApiKey,
          databaseId: notionDatabaseId,
        },
      });

      const clientId = c.env.TWITTER_CLIENT_ID;
      const clientSecret = c.env.TWITTER_CLIENT_SECRET;
      await tweetBounty({
        clientId,
        clientSecret,
      });

      return c.json({ message: 'Webhook received' });
    } catch (e) {
      console.log(e);
      c.status(200);
      return c.json({ message: 'Unauthorized' });
    }
  }
);

export const settingUpTwitter = factory.createHandlers(async (c) => {
  try {
    const clientId = c.env.TWITTER_CLIENT_ID;
    const clientSecret = c.env.TWITTER_CLIENT_SECRET;
    const twitterClient = new TwitterAPI({
      clientId,
      clientSecret,
    });

    const callbackURL = c.env.TWITTER_CALLBACK_URL;

    // generate the OAuth2 link
    // this will return the URL, codeVerifier and state
    // the codeVerifier and state are used to generate the access token
    // the url is the link that the user needs to visit
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
      callbackURL,
      { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
    );

    // need to store the codeVerifier and the state
    // so storing it in a class variable
    twitterStore.codeVerifier = codeVerifier;
    twitterStore.state = state;

    return c.redirect(url);
  } catch (e) {
    console.log(e);
    c.status(500);
    return c.json({ message: 'Error setting up Twitter' });
  }
});

export const handlingTwitterCallback = factory.createHandlers(async (c) => {
  try {
    const clientId = c.env.TWITTER_CLIENT_ID;
    const clientSecret = c.env.TWITTER_CLIENT_SECRET;
    const twitterClient = new TwitterAPI({
      clientId,
      clientSecret,
    });

    const { state, code } = c.req.query();

    // check if the state is the same as the one we stored
    if (state !== twitterStore.state) {
      c.status(400);
      return c.json({ message: 'Invalid state' });
    }

    const callbackURL = c.env.TWITTER_CALLBACK_URL;
    // generate the access token
    const {
      client: loggedClient,
      accessToken,
      refreshToken,
    } = await twitterClient.loginWithOAuth2({
      code,
      codeVerifier: twitterStore.codeVerifier,
      redirectUri: callbackURL,
    });

    // Storing the access token and refresh token
    twitterStore.accessToken = accessToken;
    twitterStore.refreshToken = refreshToken!; // refresh token is not null

    const { data } = await loggedClient.v2.me();

    return c.json(data);
  } catch (e) {
    console.log(e);
    c.status(500);
    return c.json({ message: 'Error handling Twitter callback' });
  }
});
