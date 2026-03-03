const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const port = 3000;
// public klasöründeki HTML, CSS dosyalarını dışarıya açar
app.use(express.static('public'));

// --- 1. VERİTABANI BAĞLANTISI ---
const sequelize = new Sequelize('n1_demo', 'root', '', {
  host: 'localhost',
  dialect: 'mysql',
  logging: console.log 
});

// --- 2. MODELLERİ TANIMLAMA ---
const Author = sequelize.define('Author', {
  name: { type: DataTypes.STRING, allowNull: false }
}, { timestamps: false });

const Book = sequelize.define('Book', {
  title: { type: DataTypes.STRING, allowNull: false }
}, { timestamps: false });

Author.hasMany(Book, { as: 'books', foreignKey: 'authorId' });
Book.belongsTo(Author, { foreignKey: 'authorId' });

// --- 3. API UÇ NOKTALARI (ROUTES) ---

// ❌ Hatalı (N+1) Kullanım Linki
app.get('/hatali', async (req, res) => {
  try {
    const sqlLogs = []; // Atılan sorguları biriktireceğimiz sepet
    const logger = (sql) => sqlLogs.push(sql); // Sequelize'a özel log yakalayıcı

    const authors = await Author.findAll({ logging: logger });
    const result = [];
    
    for (const author of authors) {
      const books = await Book.findAll({ 
        where: { authorId: author.id },
        logging: logger // Döngü içindeki her sorguyu sepete at
      });
      result.push({ yazarAdi: author.name, kitaplar: books });
    }
    
    // Hem veriyi hem de yakaladığımız SQL sorgularını (logları) tarayıcıya gönder
    res.json({ veri: result, loglar: sqlLogs });
  } catch (error) {
    res.status(500).json({ hata: error.message });
  }
});

// ✅ Doğru (Eager Loading) Kullanım Linki
app.get('/dogru', async (req, res) => {
  try {
    const sqlLogs = [];
    const logger = (sql) => sqlLogs.push(sql);

    const authors = await Author.findAll({
      include: [{ model: Book, as: 'books' }],
      logging: logger // Tek atılan dev sorguyu sepete at
    });
    
    // Veriyi formata uydur ve loglarla birlikte gönder
    const result = authors.map(a => ({ yazarAdi: a.name, kitaplar: a.books }));
    res.json({ veri: result, loglar: sqlLogs });
  } catch (error) {
    res.status(500).json({ hata: error.message });
  }
});

// --- 4. SUNUCUYU BAŞLATMA VE TEST VERİSİ EKLEME ---
app.listen(port, async () => {
  console.log(`Sunucu başlatılıyor...`);
  
  // Tabloları oluştur ve test verilerini ekle
  await sequelize.sync({ force: true });
  
  const author1 = await Author.create({ name: 'J.R.R. Tolkien' });
  await Book.bulkCreate([
    { title: 'Yüzük Kardeşliği', authorId: author1.id },
    { title: 'İki Kule', authorId: author1.id }
  ]);

  const author2 = await Author.create({ name: 'George Orwell' });
  await Book.bulkCreate([
    { title: '1984', authorId: author2.id },
    { title: 'Hayvan Çiftliği', authorId: author2.id }
  ]);

  console.log(`\n✅ Sunucu çalışıyor! Tarayıcınızda şu linkleri test edebilirsiniz:`);
  console.log(`❌ N+1 Testi: http://localhost:${port}/hatali`);
  console.log(`✅ Doğru Test: http://localhost:${port}/dogru\n`);
});