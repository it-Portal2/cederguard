const fs = require('fs');
const file = 'src/pages/Landing.tsx';
let content = fs.readFileSync(file, 'utf8');

// Colors
content = content.replace(/bg-\[\#030303\]/g, 'bg-white dark:bg-[#030303]');
content = content.replace(/bg-white\/5(?!0)/g, 'bg-slate-200 dark:bg-white/5');
content = content.replace(/bg-white\/\[0\.01\]/g, 'bg-slate-50 dark:bg-white/[0.01]');
content = content.replace(/bg-white\/\[0\.02\]/g, 'bg-slate-100 dark:bg-white/[0.02]');
content = content.replace(/bg-white\/20/g, 'bg-slate-300 dark:bg-white/20');
content = content.replace(/bg-white\/10/g, 'bg-slate-200 dark:bg-white/10');

// Text
content = content.replace(/text-white\/80/g, 'text-slate-700 dark:text-white/80');
content = content.replace(/text-white\/70/g, 'text-slate-600 dark:text-white/70');
content = content.replace(/text-white\/60/g, 'text-slate-500 dark:text-white/60');
content = content.replace(/text-white\/50/g, 'text-slate-500 dark:text-white/50');
content = content.replace(/text-white\/40/g, 'text-indigo-600 dark:text-white/40');
content = content.replace(/text-white\/30/g, 'text-slate-400 dark:text-white/30');
content = content.replace(/text-white\/20/g, 'text-slate-300 dark:text-white/20');
// Carefully replace exact text-white where not part of something else
content = content.replace(/(?<!border-|bg-|text-|from-|to-|via-)text-white(?!\/\d+|\/\[)/g, 'text-slate-900 dark:text-white');

// Borders
content = content.replace(/border-white\/5(?!0)/g, 'border-slate-200 dark:border-white/5');
content = content.replace(/border-white\/10/g, 'border-slate-200 dark:border-white/10');
content = content.replace(/border-white\/20/g, 'border-slate-300 dark:border-white/20');
content = content.replace(/border-white\/30/g, 'border-slate-400 dark:border-white/30');
content = content.replace(/border-white\/\[0\.03\]/g, 'border-slate-200 dark:border-white/[0.03]');
content = content.replace(/border-white(?!\/\d+|\/\[)/g, 'border-slate-300 dark:border-white');

// Root div
content = content.replace(
  'className="bg-white dark:bg-[#030303] text-slate-700 dark:text-white/80 font-sans antialiased selection:bg-slate-300 dark:bg-white/20 selection:text-slate-900 dark:text-white min-h-screen"',
  'className="bg-slate-50 dark:bg-[#030303] text-slate-800 dark:text-white/80 font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-white min-h-screen transition-colors duration-500"'
);

// Buttons
content = content.replace(
  'bg-white text-black',
  'bg-indigo-600 text-white dark:bg-white dark:text-slate-950 shadow-lg dark:shadow-[0_0_20px_rgba(255,255,255,0.3)]'
);
content = content.replace(
  'hover:bg-white/90',
  'hover:bg-indigo-700 dark:hover:bg-cyan-50'
);

// Footer
content = content.replace('border-t border-slate-200 dark:border-white/5', 'border-t border-slate-200 dark:border-white/10');
content = content.replace('border-white/[0.03]', 'border-slate-200 dark:border-white/[0.03]');

// Fix dynamic text color for white mode
content = content.replace(
  'text-indigo-600 dark:text-white/40 uppercase mb-8',
  'text-indigo-600 dark:text-indigo-400 uppercase mb-8'
);
content = content.replace(
  'text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-[0.2em] font-medium',
  'text-[10px] text-slate-500 dark:text-white/30 uppercase tracking-[0.2em] font-medium'
);

fs.writeFileSync(file, content);
console.log('Script completed successfully');
