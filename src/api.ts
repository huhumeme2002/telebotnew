import { config } from './config';

async function fetchJSON(url: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  return res.json();
}

// ========== ClaudeCode APIs ==========

export async function createClaudeCodeKey(planId: string, customerName: string) {
  return fetchJSON(`${config.claudecode.url}/api/provision/create-key`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.claudecode.secret}` },
    body: JSON.stringify({ plan_id: planId, customer_name: customerName }),
  });
}

export async function checkKey(apiKey: string) {
  return fetchJSON(`${config.claudecode.url}/api/user/status`, {
    headers: { 'x-api-key': apiKey },
  });
}

async function adminLogin(): Promise<string> {
  const res = await fetchJSON(`${config.claudecode.url}/api/admin/login`, {
    method: 'POST',
    body: JSON.stringify({ password: config.claudecode.adminPassword }),
  });
  return res.token;
}

export async function extendKey(apiKey: string, durationDays: number) {
  const token = await adminLogin();
  return fetchJSON(`${config.claudecode.url}/api/admin/keys/extend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key: apiKey, duration_days: durationDays }),
  });
}

export async function extendKeySetExpiry(apiKey: string, expiry: string) {
  const token = await adminLogin();
  return fetchJSON(`${config.claudecode.url}/api/admin/keys/extend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key: apiKey, set_expiry: expiry }),
  });
}

export async function upgradeKey(existingKey: string, newPlanId: string, customerName: string) {
  return fetchJSON(`${config.claudecode.url}/api/provision/create-key`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.claudecode.secret}` },
    body: JSON.stringify({ plan_id: newPlanId, customer_name: customerName, existing_key: existingKey }),
  });
}

// ========== Codex APIs (Combo) ==========

async function codexLogin(): Promise<string> {
  const res = await fetchJSON(`${config.codex.url}/api/agents/login`, {
    method: 'POST',
    body: JSON.stringify({ account: config.codex.account, passwd: config.codex.password }),
  });
  return res.data.token;
}

export async function createComboCard(type: string, cnt: number = 1): Promise<string[]> {
  const token = await codexLogin();
  const res = await fetchJSON(`${config.codex.url}/api/agents/create-card`, {
    method: 'POST',
    headers: { authorization: token },
    body: JSON.stringify({ cnt: String(cnt), type, power: 2, product: 'augment' }),
  });
  if (res.code !== 0) throw new Error(`Codex error: ${JSON.stringify(res)}`);
  return res.data;
}

export async function disableComboCard(key: string) {
  const token = await codexLogin();
  return fetchJSON(`${config.codex.url}/api/agents/disable?code=${encodeURIComponent(key)}&product=augment`, {
    headers: { authorization: token },
  });
}

// ========== Zeno360 APIs (Combo) ==========

async function zenoLogin(): Promise<string> {
  const res = await fetchJSON(`${config.zeno.url}/api/admin/login`, {
    method: 'POST',
    body: JSON.stringify({ password: config.zeno.password }),
  });
  return res.token;
}

export async function createZenoKey(name: string, expiryDate: string) {
  const token = await zenoLogin();
  return fetchJSON(`${config.zeno.url}/api/admin/keys/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, expiry: expiryDate, daily_limit: 150 }),
  });
}

export async function deleteZenoKey(name: string) {
  const token = await zenoLogin();
  return fetchJSON(`${config.zeno.url}/api/admin/keys/delete?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
