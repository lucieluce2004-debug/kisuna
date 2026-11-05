import {build} from 'esbuild';
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd(),sourcefile:'supabase-client.js'},bundle:true,format:'iife',globalName:'supabase',platform:'browser',target:'es2022',minify:true,legalComments:'eof',outfile:'dist/vendor/supabase.js'});
