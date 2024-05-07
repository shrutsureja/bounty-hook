import TwitterAPI from 'twitter-api-v2';
import twitterStore from './twitterStore';
type TweetBountyArgs = {
  clientId: string;
  clientSecret: string;
};

export async function tweetBounty({ clientId, clientSecret }: TweetBountyArgs) {
  const twitterClient = new TwitterAPI({
    clientId,
    clientSecret,
  });

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(twitterStore.refreshToken);

  // update the refresh token
  twitterStore.refreshToken = newRefreshToken!; // refresh token is not null
  twitterStore.accessToken = accessToken;

  // generate the tweet data
  const tweetPayload = `Testing out the tweet bounty feature!
    from tweetBounty function
    ${new Date().toLocaleDateString()}
  `;
  const { data } = await refreshedClient.v2.tweet(tweetPayload);
  return data;
}
