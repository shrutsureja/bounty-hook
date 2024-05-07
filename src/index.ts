import { Hono } from 'hono';
import {
  handlingTwitterCallback,
  settingUpTwitter,
  webhookHandler,
} from './middleware';

type Bindings = {
  GITHUB_WEBHOOK_SECRET: string;
  ADMIN_USERNAMES: string;
  Variables: {
    error: boolean;
  };
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => {
  console.log(c.env.GITHUB_WEBHOOK_SECRET);
  return c.text('Hello Hono!');
});

app.post('/webhook', ...webhookHandler);

// Hndling the twitter callback
app.get('/setup-twitter', ...settingUpTwitter);
app.get('/twitter/callback', ...handlingTwitterCallback);

export default app;
