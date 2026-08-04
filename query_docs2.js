const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://univai:univai@localhost:5433/univai' });
client.connect().then(() => {
  return client.query("SELECT * FROM books WHERE student_id = 'S-2026-000009' ORDER BY id DESC LIMIT 5").then(res => {
    console.log("books:", JSON.stringify(res.rows, null, 2));
    return client.query("SELECT * FROM source_documents ORDER BY id DESC LIMIT 5");
  }).then(res => {
    console.log("source_documents:", JSON.stringify(res.rows, null, 2));
    client.end();
  });
}).catch(console.error);
