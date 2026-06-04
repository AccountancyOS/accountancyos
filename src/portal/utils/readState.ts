const KEY = "portal:lastRead:v1";

type Map = Record<string, string>;

function read(): Map {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Map) : {};
  } catch {
    return {};
  }
}

function write(m: Map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* noop */
  }
}

export function getLastRead(conversationId: string): string | null {
  return read()[conversationId] ?? null;
}

export function markConversationRead(conversationId: string, at: string = new Date().toISOString()) {
  const m = read();
  m[conversationId] = at;
  write(m);
}

export function isUnread(conversationId: string, lastMessageAt: string, lastSender: string) {
  if (lastSender === "client") return false;
  const lr = getLastRead(conversationId);
  if (!lr) return true;
  return new Date(lastMessageAt).getTime() > new Date(lr).getTime();
}