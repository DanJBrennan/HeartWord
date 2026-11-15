import {createRequire} from 'node:module';
export const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
