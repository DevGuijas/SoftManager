const sqlite3 = require('sqlite3').verbose();

// Conecta (ou cria) o arquivo do banco de dados
const db = new sqlite3.Database('./softmanager.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco:', err.message);
    } else {
        console.log('Conectado ao banco SQL Local (SQLite).');
    }
});

db.serialize(() => {
    // 1. Tabela Clientes
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT,
        empresa TEXT
    )`);

    // 2. Tabela Projetos
    db.run(`CREATE TABLE IF NOT EXISTS projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        status TEXT DEFAULT 'Pendente',
        cliente_id INTEGER,
        FOREIGN KEY(cliente_id) REFERENCES clientes(id)
    )`);

    // 3. Tabela Usuários (Com tipo_acesso)
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_acesso TEXT DEFAULT 'colaborador', -- 'admin' ou 'colaborador'
        nome TEXT,
        email TEXT UNIQUE,
        senha TEXT,
        cargo TEXT
    )`);

    // 4. Tabela Equipe do Projeto
    db.run(`CREATE TABLE IF NOT EXISTS projeto_equipe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER,
        usuario_id INTEGER,
        funcao_no_projeto TEXT,
        FOREIGN KEY(projeto_id) REFERENCES projetos(id),
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    )`);

    // 5. Tabela Arquivos (Repositório)
    db.run(`CREATE TABLE IF NOT EXISTS arquivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER,
        usuario_id INTEGER, -- Quem fez o upload
        nome_original TEXT,
        nome_salvo TEXT,
        caminho TEXT,
        data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(projeto_id) REFERENCES projetos(id),
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    )`);

    // 6. Tabela Logs de Auditoria
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER,
        usuario_id INTEGER,
        acao TEXT, -- Ex: 'Upload', 'Exclusão', 'Edição'
        detalhe TEXT, -- Ex: 'Arquivo main.js excluído'
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // --- POPULAR O BANCO COM DADOS INICIAIS (SEED) ---
    // Verifica se já existem usuários. Se não, cria tudo do zero.
    db.get("SELECT count(*) as qtd FROM usuarios", (err, row) => {
        if (row.qtd === 0) {
            console.log("Banco vazio detectado. Criando dados iniciais...");
            
            // Lista de Usuários Iniciais
            const users = [
                ['colaborador', 'Otávio', 'otavio@soft.com', '123', 'Desenvolvedor Junior'],
                ['colaborador', 'Icaro', 'icaro@soft.com', '123', 'Desenvolvedor Junior'],
                ['colaborador', 'Yuri', 'yuri@soft.com', '123', 'Desenvolvedor Pleno'],
                ['colaborador', 'Eduardo', 'eduardo@soft.com', '123', 'Desenvolvedor Sênior'],
                ['admin', 'Guilherme', 'guilherme@soft.com', '123', 'Desenvolvedor Sênior'], // ADMIN
                ['admin', 'Admin', 'admin@soft.com', 'admin', 'CEO'] // ADMIN
            ];

            const stmtUser = db.prepare("INSERT INTO usuarios (tipo_acesso, nome, email, senha, cargo) VALUES (?,?,?,?,?)");
            users.forEach(u => stmtUser.run(u));
            stmtUser.finalize();

            // Cria um Cliente Fictício
            db.run("INSERT INTO clientes (nome, email, empresa) VALUES ('João Silva', 'joao@loja.com', 'Loja Virtual LTDA')", function(err) {
                const clienteId = this.lastID;
                
                // Cria o Projeto E-commerce
                db.run("INSERT INTO projetos (nome, status, cliente_id) VALUES ('E-commerce', 'Em Andamento', ?)", [clienteId], function(err) {
                    const projId = this.lastID;
                    
                    // Vincula a Equipe ao Projeto
                    const equipe = [
                        [projId, 1, 'Backend Junior'],      // Otávio
                        [projId, 2, 'Frontend Junior'],     // Icaro
                        [projId, 3, 'TechLeader'],          // Yuri
                        [projId, 4, 'Backend Sênior'],      // Eduardo
                        [projId, 5, 'Frontend Sênior'],     // Guilherme
                        [projId, 6, 'Supervisor Geral']     // Admin
                    ];
                    
                    const stmtEquipe = db.prepare("INSERT INTO projeto_equipe (projeto_id, usuario_id, funcao_no_projeto) VALUES (?,?,?)");
                    equipe.forEach(e => stmtEquipe.run(e));
                    stmtEquipe.finalize();
                    
                    console.log("Dados de teste (E-commerce e Usuários) criados com sucesso!");
                });
            });
        }
    });
});

module.exports = db;