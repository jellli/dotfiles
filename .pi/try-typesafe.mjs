#!/usr/bin/env node
// try-typesafe.mjs — one real System One call, zero dependencies (Node 24 has fetch).
//
//   node try-typesafe.mjs "text to judge"
//   echo "text to judge" | node try-typesafe.mjs
//   node try-typesafe.mjs --json ...      # raw response
//   node try-typesafe.mjs --self-check    # asserts the request shape, no key needed
//
// Reads TYPESAFE_API_KEY (required), TYPESAFE_BASE_URL, TYPESAFE_DEFAULT_MODEL.

export const DEMO =
  "Hi, I've been trying to connect my Stripe account for 3 days and it keeps failing. I'm losing sales. Please help ASAP.";

// One call, three primitives: choice (pick one), score (graded), noul (yes/no probability).
export function buildRequest(state) {
  return {
    state,
    model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
    questions: {
      route: {
        type: "choice",
        instructions: "Which team should handle this?",
        criteria: {
          billing: "Payment or subscription issues",
          technical: "Bugs or integration problems",
          sales: "Pricing or account questions",
          other: "None of the above",
        },
      },
      frustration: {
        type: "score",
        instructions: "How frustrated does the author appear?",
        criteria: ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"],
      },
      urgent: {
        type: "noul",
        instructions: "The message conveys urgency or time-sensitivity",
      },
    },
  };
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let out = "";
  for await (const chunk of process.stdin) out += chunk;
  return out.trim();
}

async function main(argv) {
  if (argv.includes("--self-check")) return selfCheck();

  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    console.error("TYPESAFE_API_KEY is not set. Get one at https://console.typesafe.ai/settings/keys");
    process.exit(2);
  }

  const text = argv.filter((a) => !a.startsWith("--")).join(" ") || (await readStdin()) || DEMO;
  const base = process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai";
  const started = Date.now();
  const res = await fetch(`${base}/v1/systemone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildRequest(text)),
  });
  const latency = Date.now() - started;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, JSON.stringify(body));
    process.exit(1);
  }
  if (argv.includes("--json")) return console.log(JSON.stringify(body, null, 2));

  const a = body.answers;
  console.log(`route        ${a.route.choice}  (p=${a.route.probabilities[a.route.choice]}, confidence=${a.route.confidence})`);
  console.log(`frustration  ${a.frustration.score.toFixed(2)}  (confidence=${a.frustration.confidence})`);
  console.log(`urgent       ${a.urgent.noul}`);
  console.log(`\n${JSON.stringify(body.usage)}  ${latency}ms`);
}

// The only real logic here is the request shape; assert it so it silently can't drift.
function selfCheck() {
  const r = buildRequest("x");
  const t = (q, want) => {
    if (r.questions[q].type !== want) throw new Error(`${q}: expected ${want}`);
  };
  t("route", "choice");
  t("frustration", "score");
  t("urgent", "noul");
  if (Object.keys(r.questions.route.criteria).length !== 4) throw new Error("choice criteria lost an option");
  if (r.questions.frustration.criteria.length !== 3) throw new Error("score levels lost");
  if (typeof r.questions.urgent.criteria !== "undefined") throw new Error("noul must not carry criteria");
  if (r.state !== "x" || r.model === undefined) throw new Error("state/model missing");
  console.log("self-check ok");
}

await main(process.argv.slice(2));
