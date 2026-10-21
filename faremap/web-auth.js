// Client-side consistency only. Supabase remains the authentication authority.
export function sessionIdentity(session) {
  const userId = session?.user?.id || null;
  if (!userId) return { userId: null, sessionId: null };
  try {
    const part = String(session.access_token || "").split(".")[1];
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.sub !== userId || typeof claims.session_id !== "string" || !claims.session_id) {
      return { userId, sessionId: null };
    }
    return { userId, sessionId: claims.session_id };
  } catch (_) { return { userId, sessionId: null }; }
}

export function createIdentityClock() {
  let current = { userId: null, sessionId: null, epoch: 0 };
  let eventVersion = 0;
  return {
    snapshot: () => ({ ...current }),
    beginSeed: () => eventVersion,
    acceptSeed: version => version === eventVersion,
    event() { eventVersion++; },
    observe(session) {
      const next = sessionIdentity(session);
      const changed = next.userId !== current.userId || next.sessionId !== current.sessionId;
      current = { ...next, epoch: current.epoch + (changed ? 1 : 0) };
      return changed;
    },
    isCurrent(owner) {
      return owner.epoch === current.epoch && owner.userId === current.userId &&
        owner.sessionId === current.sessionId;
    }
  };
}

// A code is verified without persistence first. A late adoption may not overwrite
// a session established by a different sign-in while setSession awaited the SDK lock.
export function createGuardedAuthStorage(storage) {
  let guard = null;
  return {
    getItem(key) { return storage.getItem(key); },
    removeItem(key) {
      // Supabase removes the PKCE verifier before saving a session. An obsolete
      // adoption must not remove the verifier belonging to a newer Google login.
      if (guard && key.endsWith("-code-verifier") && !guard.isCurrent()) return;
      return storage.removeItem(key);
    },
    setItem(key, value) {
      let candidate;
      try { candidate = JSON.parse(value); } catch (_) { /* PKCE verifier, not a session */ }
      if (guard && candidate?.access_token === guard.accessToken && !guard.isCurrent()) {
        throw new Error("FareMap sign-in was cancelled because the account or email changed.");
      }
      return storage.setItem(key, value);
    },
    guardSession(accessToken, isCurrent) {
      if (guard) throw new Error("Another FareMap sign-in is finishing. Please wait.");
      const next = { accessToken, isCurrent };
      guard = next;
      return () => { if (guard === next) guard = null; };
    }
  };
}
