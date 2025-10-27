export async function handler(event) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const siteUrl = process.env.SITE_URL;

  if (!clientId || !siteUrl) {
    return {
      statusCode: 500,
      body: "Missing GITHUB_CLIENT_ID or SITE_URL env vars"
    };
  }

  // GitHub will redirect back to /api/auth/callback with a temporary `code`
  const redirectUri = encodeURIComponent(`${siteUrl}/api/auth/callback`);

  const githubAuthURL = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user&redirect_uri=${redirectUri}`;

  return {
    statusCode: 302,
    headers: {
      Location: githubAuthURL,
    },
  };
}
