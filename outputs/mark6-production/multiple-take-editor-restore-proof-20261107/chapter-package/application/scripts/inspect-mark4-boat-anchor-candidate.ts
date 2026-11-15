import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { shotRiskFor, tierForRisk } from "../src/pipeline/media-generation/shot-risk-lookup.js";

const shotId = "b4f60ed5-c4f4-436f-bfac-fb0e8b357fdf";
const rows = getDb().prepare(`SELECT id, provider, model, operation, result_asset_path, status, cost_usd
  FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video'
  ORDER BY created_at DESC`).all(shotId);
const ledger = getDb().prepare(`SELECT cle.amount_usd, ga.provider, ga.model, ga.operation
  FROM cost_ledger_entries cle JOIN generation_attempts ga ON ga.id=cle.generation_attempt_id
  WHERE ga.shot_id=? ORDER BY cle.created_at DESC`).all(shotId);
const risk = shotRiskFor(getDb(), shotId);
console.log(JSON.stringify({ rows, ledger, risk, veoTier: tierForRisk(risk) }, null, 2));
