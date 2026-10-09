// A stand-in for the D1 binding that records every statement a handler runs, for checks that need to see
// exactly what touches the database (and in what order) without a server.
// `answer({sql, args}, kind)` returns the result (or a promise) for each statement; kind is first, run or all.
export function mockDb(answer) {
  const log = [];
  const norm = (sql) => sql.replace(/\s+/g, " ").trim();
  function statement(sql, args = []) {
    const s = { sql: norm(sql), args };
    const exec = (kind) => {
      log.push(s);
      return Promise.resolve(answer(s, kind));
    };
    return { s, bind: (...a) => statement(sql, a), first: () => exec("first"), run: () => exec("run"), all: () => exec("all") };
  }
  return {
    log,
    prepare: (sql) => statement(sql),
    batch: (list) => Promise.all(list.map((st) => (log.push(st.s), Promise.resolve(answer(st.s, "run"))))),
  };
}

/** Throwaway secrets in the shape the Worker expects. */
export async function mockSecrets() {
  const crypto = await import("node:crypto");
  return { PEPPER: crypto.randomBytes(32).toString("hex"), PHONE_KEY: crypto.randomBytes(32).toString("base64") };
}

/** A JSON POST the way the browser sends it. */
export function jsonRequest(path, body, ip = "10.250.0.1") {
  return new Request("https://map.test" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FBS": "1", Origin: "https://map.test", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}
