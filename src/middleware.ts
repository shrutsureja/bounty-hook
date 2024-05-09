import { createFactory } from 'hono/factory';
import { extractAmount, hexToBytes, isBountyComment } from './utils';
import {
  generateOAuth2AuthLink,
  loginWithOauth2,
  refreshOAuth2Token,
  tweet,
} from './twitter';

const encoder = new TextEncoder();

const factory = createFactory();

type twitterStoreType = {
  codeVerifier: string;
  state: string;
  accessToken: string;
  refreshToken: string;
};

const twitterStore: twitterStoreType = {
  codeVerifier: '',
  state: '',
  accessToken: '',
  refreshToken: '',
};

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
      let currentRefreshToken;
      let currentAccessToken;
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

      // await addBountyToNotion({
      //   username: author,
      //   amount: bountyAmount,
      //   notion: {
      //     apiKey: notionApiKey,
      //     databaseId: notionDatabaseId,
      //   },
      // });

      // Making a tweet with the bounty amount
      console.log('Complete twitter store', JSON.stringify(twitterStore));
      console.log('AccessToken=', twitterStore.accessToken);
      console.log('RefreshToken=', twitterStore.refreshToken);

      const { refreshToken, accessToken } = twitterStore;
      currentRefreshToken = refreshToken;
      currentAccessToken = accessToken;
      // Tweet Payload
      const tweetPayload = `Contrulations to the user ${author} for winning a bounty of ${bountyAmount}! 🎉🎉🎉 #bounty #winner`;

      if (!currentAccessToken) {
        const { accessToken, refreshToken } = await refreshOAuth2Token({
          refreshToken: twitterStore.refreshToken,
          clientId: c.env.TWITTER_CLIENT_API_KEY,
        });

        console.log('newAccessToken=', accessToken);
        console.log('newRefreshToken=', refreshToken);
        currentAccessToken = accessToken;
        currentRefreshToken = refreshToken;
      }

      const response = await tweet({
        tweet: tweetPayload,
        accessToken: currentAccessToken,
      });
      if (!response.data) {
        return c.json({ message: 'Error in tweeting' });
      }

      twitterStore.accessToken = currentAccessToken;
      twitterStore.refreshToken = currentRefreshToken;
      return c.json({ message: 'Webhook received' });
    } catch (e) {
      console.log(e);
      c.status(200);
      return c.json({ message: 'Unauthorized' });
    }
  }
);

/**
 * This handler is used to set up the Twitter oauth2 flow and generate the oauth2 URL
 * @query callbackUrl The callback URL to redirect after the oauth2 flow
 */
export const settingUpTwitter = factory.createHandlers(async (c) => {
  // Generating oauth2 URL
  // storing this for later use
  // Generating the oauth2 URL
  const { url, codeVerifier, state } = await generateOAuth2AuthLink({
    callbackUrl: c.env.TWITTER_CALLBACK_URL,
    state: 'state',
    codeChallenge: 'challenge',
    code_challenge_method: 'plain',
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    clientId: c.env.TWITTER_CLIENT_API_KEY,
  });

  // storing this for later use
  twitterStore.codeVerifier = codeVerifier;
  twitterStore.state = state;
  // console.log('codeVerifier=', twitterStore.codeVerifier);
  // console.log('state=', twitterStore.state);

  return c.redirect(url);
});

/**
 * This handler is used to handle the callback from the Twitter oauth2 flow
 * and store the access token and refresh token
 * @query code The code returned from the oauth2 flow comes from the Twitter
 * @query state The state parameter for CSRF protection comes from the Twitter
 */
export const twitterOauth2CallbackHandler = factory.createHandlers(
  async (c) => {
    // Handling Twitter oauth2 callback
    const { code, state } = c.req.query();

    // Checking if the state is same as the one we stored earlier otherwise return 401
    if (state !== twitterStore.state) {
      return c.status(401);
    }

    // Now passing the code,callbackUrl and codeVerifier to loginWithOauth2 method
    // to get the access token and refresh token
    const { accessToken, refreshToken } = await loginWithOauth2({
      code: code,
      codeVerifier: twitterStore.codeVerifier,
      redirectUri: c.env.TWITTER_CALLBACK_URL,
      clientId: c.env.TWITTER_CLIENT_API_KEY,
      clientSecret: c.env.TWITTER_CLIENT_SECRET,
    });

    // If the access token or refresh token is not present return 401
    if (!accessToken || !refreshToken) return c.status(401);

    // Storing the access token and refresh token
    twitterStore.accessToken = accessToken;
    twitterStore.refreshToken = refreshToken;
    console.log('accessToken=', twitterStore.accessToken);
    console.log('refreshToken=', twitterStore.refreshToken);

    return c.json({ message: 'Twitter authenticated' });
  }
);

export const valuesHandler = factory.createHandlers(async (c) => {
  console.log(twitterStore);

  return c.json({ twitterStore });
});
