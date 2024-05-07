class TwitterStore {
  private static codeVerifier: string;
  private static state: string;
  private static accessToken: string;
  private static refreshToken: string;

  get codeVerifier(): string {
    console.log('Getting code verifier', this.codeVerifier);
    return this.codeVerifier;
  }
  get state(): string {
    console.log('Getting state', this.state);
    return this.state;
  }
  get accessToken(): string {
    console.log('Getting access token', this.accessToken);
    return this.accessToken;
  }
  get refreshToken(): string {
    console.log('Getting refresh token', this.refreshToken);
    return this.refreshToken;
  }
  set codeVerifier(codeVerifier: string) {
    console.log('Setting code verifier', codeVerifier);
    this.codeVerifier = codeVerifier;
  }
  set state(state: string) {
    console.log('Setting state', state);
    this.state = state;
  }
  set accessToken(accessToken: string) {
    console.log('Setting access token', accessToken);
    this.accessToken = accessToken;
  }
  set refreshToken(refreshToken: string) {
    console.log('Setting refresh token', refreshToken);
    this.refreshToken = refreshToken;
  }
}

const twitterStore = new TwitterStore();
// Not exporting the class, as we only need a single instance of it
// multiple instances would be redundant
export default twitterStore;
