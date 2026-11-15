import {fileURLToPath} from 'node:url';
export default {root:'.',resolve:{alias:{'node:sqlite':fileURLToPath(new URL('./sqlite-diagnostic-shim.mjs',import.meta.url))}},test:{include:['outputs/mark6-production/diagnose-director-r64.test.ts']}};
