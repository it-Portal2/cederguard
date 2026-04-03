import fs from 'fs';

const filesToUpdate = [
    'src/pages/Landing.tsx',
    'src/pages/public/About.tsx',
    'src/pages/public/Product.tsx',
    'src/pages/public/News.tsx',
    'src/pages/public/Support.tsx',
    'src/pages/public/Contact.tsx',
    'src/components/public/PublicLayout.tsx'
];

for (const file of filesToUpdate) {
    if (!fs.existsSync(file)) {
        console.log('Skipping', file);
        continue;
    }
    let content = fs.readFileSync(file, 'utf8');

    // Backgrounds
    content = content.replace(/indigo-950/g, 'slate-950');
    content = content.replace(/indigo-900/g, 'slate-900');
    content = content.replace(/indigo-800/g, 'slate-800');
    content = content.replace(/bg-indigo-950/g, 'bg-slate-950');

    // Accents mapping
    content = content.replace(/violet-900/g, 'teal-900');
    content = content.replace(/violet-500/g, 'teal-500');
    content = content.replace(/violet-400/g, 'teal-400');
    content = content.replace(/violet-300/g, 'teal-300');

    content = content.replace(/fuchsia-900/g, 'emerald-900');
    content = content.replace(/fuchsia-500/g, 'emerald-500');
    content = content.replace(/fuchsia-400/g, 'emerald-400');
    content = content.replace(/fuchsia-300/g, 'emerald-300');

    // Specific sky/amber left
    // Cyan is already teal-adjacent, leaving it.

    fs.writeFileSync(file, content);
    console.log('Updated', file);
}
