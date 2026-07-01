const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATA PERSISTENCE LAYER ---
const DB_FILE = path.join(__dirname, 'letters_db.json');
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ letters: [] }, null, 2));
}

function getLetters() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).letters;
    } catch (e) {
        return [];
    }
}

function saveLetters(letters) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ letters }, null, 2));
}

// --- MIDDLEWARE & STORAGE CONFIG ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- API ENDPOINTS ---
app.post('/api/letters', upload.single('letterImage'), (req, res) => {
    const { author, relationship, letterText, order } = req.body;
    const letters = getLetters();
    
    const newLetter = {
        id: Date.now().toString(),
        author: author || 'Anonymous',
        relationship: relationship || '',
        type: req.file ? 'image' : 'text',
        content: req.file ? `/uploads/${req.file.filename}` : letterText,
        order: parseInt(order) || (letters.length + 1)
    };
    
    letters.push(newLetter);
    saveLetters(letters);
    res.redirect('/admin');
});

app.post('/api/letters/delete/:id', (req, res) => {
    let letters = getLetters();
    const letterToDelete = letters.find(l => l.id === req.params.id);
    if (letterToDelete && letterToDelete.type === 'image') {
        const filePath = path.join(__dirname, letterToDelete.content);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch(e) {}
        }
    }
    letters = letters.filter(l => l.id !== req.params.id);
    saveLetters(letters);
    res.redirect('/admin');
});

// --- FRONTEND ROUTING ---
app.get('/', (req, res) => {
    res.send(getHtmlLayout('client'));
});

app.get('/admin', (req, res) => {
    res.send(getHtmlLayout('admin'));
});

// --- UTILITY HELPER FOR HTML ESCAPING ---
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// --- MONOLITHIC HTML GENERATOR (SERVER-SIDE RENDERED) ---
function getHtmlLayout(view) {
    const letters = getLetters().sort((a, b) => a.order - b.order);

    const adminRows = letters.map(l => `
        <tr class="border-b bg-white hover:bg-gray-50">
            <td class="px-6 py-4 font-medium text-gray-900">${l.order}</td>
            <td class="px-6 py-4 font-medium">${escapeHtml(l.author)}</td>
            <td class="px-6 py-4 text-xs font-semibold uppercase">
                <span class="px-2 py-1 rounded ${l.type === 'image' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">${l.type}</span>
            </td>
            <td class="px-6 py-4">
                <form action="/api/letters/delete/${l.id}" method="POST" onsubmit="return confirm('Delete this letter?');">
                    <button type="submit" class="text-red-600 hover:underline font-medium">Delete</button>
                </form>
            </td>
        </tr>
    `).join('');

    // Render the Timeline Cards strictly on the Backend architecture
    let timelineContent = '';
    if (letters.length === 0) {
        timelineContent = '<div class="text-center py-12 text-gray-400 font-medium ml-4">The dynamic exhibition is being populated right now. Check back shortly.</div>';
    } else {
        timelineContent = letters.map(item => {
            const badge = `<div class="absolute -left-[13px] top-1.5 bg-gradient-to-r from-rose-400 to-pink-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-md ring-4 ring-white transition-transform group-hover:scale-110">${item.order}</div>`;
            
            const relationshipBadge = item.relationship ? `<span class="text-xs font-medium text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full mt-1 inline-block">${escapeHtml(item.relationship)}</span>` : '';
            
            let coreMediaHtml = '';
            if (item.type === 'text') {
                coreMediaHtml = `<div class="font-cursive text-3xl text-gray-700 leading-relaxed tracking-wide whitespace-pre-wrap">${escapeHtml(item.content)}</div>`;
            } else {
                coreMediaHtml = `
                    <div class="relative cursor-zoom-in group-inner" onclick="openLightbox('${encodeURI(item.content)}')">
                        <img src="${encodeURI(item.content)}" class="max-h-[32rem] w-full object-cover rounded-xl border border-gray-100 shadow-sm transition hover:opacity-95">
                        <div class="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition rounded-xl flex items-center justify-center text-white text-sm font-semibold">Click to expand</div>
                    </div>`;
            }

            return `
                <div class="relative pl-8 md:pl-12 group">
                    ${badge}
                    <div class="letter-card bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-rose-100/60 hover:shadow-xl relative overflow-hidden">
                        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-gray-50 pb-4 mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-gray-900">${escapeHtml(item.author)}</h3>
                                ${relationshipBadge}
                            </div>
                            <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Chapter ${item.order} of 21</span>
                        </div>
                        <div class="mt-4">${coreMediaHtml}</div>
                    </div>
                </div>`;
        }).join('');
    }

    const isAdmin = view === 'admin';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>21 Chapters of Love</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
        <style>
            .font-cursive { font-family: 'Dancing Script', cursive; }
            .font-sans { font-family: 'Inter', sans-serif; }
            .letter-card { transition: transform 0.4s ease, box-shadow 0.4s ease; }
            .letter-card:hover { transform: translateY(-5px); }
        </style>
    </head>
    <body class="bg-gradient-to-tr from-rose-50 via-peach-50 to-amber-50 min-h-screen font-sans antialiased text-gray-800">

        ${isAdmin ? `
        <div class="max-w-4xl mx-auto py-12 px-4">
            <div class="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-rose-100">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900">Letter Management Suite</h1>
                    <p class="text-sm text-gray-500">Currently uploaded: ${letters.length} / 21 letters</p>
                </div>
                <a href="/" target="_blank" class="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition">View Live Website</a>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-rose-100 h-fit md:col-span-1">
                    <h2 class="text-lg font-semibold mb-4 text-gray-900">Add New Letter</h2>
                    <form action="/api/letters" method="POST" enctype="multipart/form-data" class="space-y-4">
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Author Name</label>
                            <input type="text" name="author" required class="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Relationship</label>
                            <input type="text" name="relationship" placeholder="e.g., Best Friend, Mom" class="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Timeline Order (1-21)</label>
                            <input type="number" name="order" min="1" max="21" value="${letters.length + 1}" required class="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Letter Content Type</label>
                            <select id="typeSelector" onchange="toggleInputType()" class="w-full px-3 py-2 border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm">
                                <option value="text">Written Text Letter</option>
                                <option value="image">Uploaded Picture / Photo</option>
                            </select>
                        </div>
                        <div id="textInputGroup">
                            <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Letter Text</label>
                            <textarea name="letterText" rows="5" class="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm"></textarea>
                        </div>
                        <div id="imageInputGroup" class="hidden">
                            <label class="block text-xs font-semibold text-gray-600 uppercase mb-1">Upload Image File</label>
                            <input type="file" name="letterImage" accept="image/*" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100">
                        </div>
                        <button type="submit" class="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 rounded-xl text-sm transition">Save to Master Mix</button>
                    </form>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden md:col-span-2">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <th class="px-6 py-3">Order</th>
                                <th class="px-6 py-3">From</th>
                                <th class="px-6 py-3">Type</th>
                                <th class="px-6 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 text-sm text-gray-600">
                            ${adminRows || '<tr><td colspan="4" class="text-center py-8 text-gray-400">No letters curated yet. Add your first letter above!</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <script>
            function toggleInputType() {
                const type = document.getElementById('typeSelector').value;
                document.getElementById('textInputGroup').classList.toggle('hidden', type !== 'text');
                document.getElementById('imageInputGroup').classList.toggle('hidden', type !== 'image');
            }
        </script>
        ` : `
        <header class="text-center py-16 px-4 max-w-2xl mx-auto">
            <span class="text-rose-500 font-semibold tracking-widest uppercase text-xs px-3 py-1 bg-rose-100 rounded-full">Happy 21st Birthday</span>
            <h1 class="text-5xl font-extrabold mt-3 text-gray-900 tracking-tight">21 Chapters of Mannat</h1>
            <p class="mt-4 text-gray-600 text-base leading-relaxed">21 letters, memories, and blessings curated carefully from the people who love you most. Scroll down to unpack your chapters.</p>
        </header>

        <main class="max-w-4xl mx-auto px-4 pb-24">
            <div id="timelineContainer" class="relative border-l-2 border-rose-200 ml-4 md:ml-32 space-y-12">
                ${timelineContent}
            </div>
        </main>

        <div id="lightbox" class="fixed inset-0 bg-black/90 hidden z-50 flex items-center justify-center p-4" onclick="this.classList.add('hidden')">
            <img id="lightboxImg" class="max-w-full max-h-full rounded-lg shadow-2xl object-contain" src="" alt="Enlarged view">
        </div>

        <script>
            function openLightbox(src) {
                document.getElementById('lightboxImg').src = src;
                document.getElementById('lightbox').classList.remove('hidden');
            }
        </script>
        `}
    </body>
    </html>
    `;
}

// --- INITIALIZE APPLICATION ENGINE ---
app.listen(PORT, () => {
    console.log("=======================================================");
    console.log("  ❤️  SSR ARCHITECT ENGINE ACTIVE RUNNING");
    console.log(`  👉 Birthday Interface URL: http://localhost:${PORT}`);
    console.log(`  👉 Admin Studio URL:       http://localhost:${PORT}/admin`);
    console.log("=======================================================");
});