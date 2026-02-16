export class HigressApiClient {
  private consoleUrl: string;
  private username: string;
  private password: string;
  private sessionCookie: string | null = null;

  constructor(config: { consoleUrl: string; username: string; password: string }) {
    this.consoleUrl = config.consoleUrl;
    this.username = config.username;
    this.password = config.password;
  }

  async ensureSession(): Promise<void> {
    if (this.sessionCookie) return;

    try {
      const resp = await fetch(`${this.consoleUrl}/session/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
      });

      if (resp.ok) {
        const setCookie = resp.headers.get('set-cookie');
        if (setCookie) {
          this.sessionCookie = setCookie.split(';')[0] || null;
        }
        console.log('[HigressApiClient] Session login successful');
      } else {
        console.log(`[HigressApiClient] Session login failed: ${resp.status}`);
      }
    } catch (e: unknown) {
      console.log(`[HigressApiClient] Session login error: ${(e as Error).message}`);
    }
  }

  async request(method: string, path: string, body?: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {
    await this.ensureSession();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.sessionCookie) {
      headers['Cookie'] = this.sessionCookie;
    }

    try {
      if (method !== 'GET') {
        console.log(`[HigressApiClient] ${method} ${this.consoleUrl}${path}`, body ? JSON.stringify(body) : '');
      }

      let resp = await fetch(`${this.consoleUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // If 401, session may have expired - re-login and retry once
      if (resp.status === 401) {
        this.sessionCookie = null;
        await this.ensureSession();
        if (this.sessionCookie) {
          headers['Cookie'] = this.sessionCookie;
          resp = await fetch(`${this.consoleUrl}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
        }
      }

      const data = await resp.json().catch(() => null);

      if (method !== 'GET') {
        console.log(`[HigressApiClient] Response: ${resp.status}`, JSON.stringify(data));
      }

      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}: ${JSON.stringify(data)}` };
      return { success: true, data };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  }

  buildProviderBody(args: Record<string, unknown>): Record<string, unknown> {
    const body = { ...args };
    const type = args['type'] as string | undefined;
    const tokens = args['tokens'] as string[] | undefined;
    const name = args['name'] as string | undefined;

    if (type && tokens) {
      body['rawConfigs'] = {
        type,
        apiTokens: tokens,
        id: name || type,
      };
    }

    return body;
  }
}
