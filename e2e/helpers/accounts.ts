// The accounts `pnpm db:seed:dev` creates, by the role and billing state
// each one exercises. Keep in step with ORGS in src/db/seed-dev.ts.
export const PASSWORD = "Test1234!";
const DOMAIN = "seed.smartdepo.test";

const at = (local: string) => `${local}@${DOMAIN}`;

export const accounts = {
  /** Starter, mid-trial — the "just signed up" company. */
  trialAdmin: { email: at("arber"), name: "Arbër Krasniqi", org: "Gjirafa Depo", role: "admin" },
  trialWorker: { email: at("lira"), name: "Lira Berisha", org: "Gjirafa Depo", role: "worker" },

  /** Business, paid, two facilities, full team — the anchor customer. */
  paidAdmin: { email: at("blerim"), name: "Blerim Gashi", org: "Prishtina Ndërtim", role: "admin" },
  paidManager: { email: at("vjosa"), name: "Vjosa Rexhepi", org: "Prishtina Ndërtim", role: "manager" },
  paidWorker: { email: at("driton"), name: "Driton Morina", org: "Prishtina Ndërtim", role: "worker" },

  /** Trial with days left — the reminder case. */
  endingTrialAdmin: { email: at("fatos"), name: "Fatos Hyseni", org: "Ferizaj Elektro", role: "admin" },

  /** Trial expired without paying — read-only lockout. */
  lockedTrialAdmin: { email: at("gent"), name: "Gent Kelmendi", org: "Peja Farma", role: "admin" },

  /** Paid once, lapsed — the expired lockout. */
  lapsedAdmin: { email: at("besnik"), name: "Besnik Ahmeti", org: "Mitrovica Auto", role: "admin" },

  /** Enterprise, three sites — also the org-switcher case via Vjosa. */
  enterpriseAdmin: { email: at("albulena"), name: "Albulena Bytyqi", org: "Prizren Tekstil", role: "admin" },
  enterpriseWorker: { email: at("kushtrim"), name: "Kushtrim Thaçi", org: "Prizren Tekstil", role: "worker" },
} as const;

export type Account = (typeof accounts)[keyof typeof accounts];
