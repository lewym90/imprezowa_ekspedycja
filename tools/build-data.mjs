// Zamienia scenario_rules_12.json na moduł JS (import JSON z atrybutem "with" nie działa na starszych iPhone'ach).
import fs from 'node:fs';
const rules=JSON.parse(fs.readFileSync(new URL('../data/scenario_rules_12.json',import.meta.url),'utf8'));
fs.writeFileSync(new URL('../src/rules-data.js',import.meta.url),`// PLIK GENEROWANY przez tools/build-data.mjs z data/scenario_rules_12.json — nie edytuj ręcznie.\nexport default ${JSON.stringify(rules)};\n`);
console.log('rules-data.js: '+rules.length+' scenariuszy');
