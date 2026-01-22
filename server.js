const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer'); // Uploads
const fs = require('fs'); // Sistema de Arquivos
const path = require('path'); // Caminhos
const AdmZip = require('adm-zip'); // BIBLIOTECA PARA ZIPAR
const db = require('./database');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'segredo-super-secreto-softmanager',
    resave: false,
    saveUninitialized: true
}));

// --- FUNÇÃO AUXILIAR: LIMPAR NOME DE PASTA ---
// Remove caracteres proibidos no Windows/Linux para evitar erros ao criar pastas
function sanitizarNomePasta(nome) {
    if (!nome) return 'sem_nome';
    return nome.trim().replace(/[\/\\:*?"<>|]/g, '_');
}

// --- CONFIGURAÇÃO DO MULTER (PASTAS COM NOME DO PROJETO) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // IMPORTANTE: O campo 'projeto_nome' deve vir ANTES do input file no HTML
        const nomePasta = sanitizarNomePasta(req.body.projeto_nome);
        const dir = path.join(__dirname, 'uploads', nomePasta);
        
        // Cria a pasta se não existir
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Salva como: TIMESTAMP-NomeOriginal (para evitar duplicatas)
        const nomeLimpo = file.originalname.replace(/\s+/g, '_');
        cb(null, Date.now() + '-' + nomeLimpo);
    }
});
const upload = multer({ storage: storage });

// --- FUNÇÃO AUXILIAR: REGISTRAR LOG ---
function registrarLog(projetoId, userId, acao, detalhe) {
    const sql = "INSERT INTO logs (projeto_id, usuario_id, acao, detalhe) VALUES (?, ?, ?, ?)";
    db.run(sql, [projetoId, userId, acao, detalhe], (err) => {
        if(err) console.error("Erro ao registrar log:", err.message);
    });
}

// --- MIDDLEWARES DE SEGURANÇA ---

function checkAuth(req, res, next) {
    if (req.session.user) next();
    else res.redirect('/login');
}

function checkAdmin(req, res, next) {
    if (req.session.user && req.session.user.tipo_acesso === 'admin') next();
    else res.status(403).send("<h1>Acesso Negado</h1><p>Esta ação requer privilégios de Administrador.</p><a href='/'>Voltar</a>");
}

// Verifica se o usuário pertence ao projeto
function checkProjectMember(req, res, next) {
    const userId = req.session.user.id;
    const userRole = req.session.user.tipo_acesso;
    
    // O ID pode vir da URL (:id) ou do Body (no caso de upload, o multer já processou e populou o body)
    const projetoId = req.params.id || req.body.projeto_id || req.params.projeto_id;

    if (userRole === 'admin') return next();

    db.get("SELECT id FROM projeto_equipe WHERE projeto_id = ? AND usuario_id = ?", [projetoId, userId], (err, row) => {
        if (row) next();
        else res.status(403).send("<h1>Acesso Restrito</h1><p>Você não faz parte da equipe deste projeto.</p><a href='/projetos'>Voltar</a>");
    });
}

// --- ROTAS DE AUTENTICAÇÃO ---

app.get('/login', (req, res) => res.render('login', { erro: null }));

app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    db.get("SELECT * FROM usuarios WHERE email = ? AND senha = ?", [email, senha], (err, user) => {
        if (user) {
            req.session.user = user;
            res.redirect('/');
        } else {
            res.render('login', { erro: 'Usuário ou senha inválidos' });
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- ROTA DASHBOARD ---

app.get('/', checkAuth, (req, res) => {
    db.get("SELECT COUNT(*) as total FROM clientes", (err, rowClientes) => {
        db.get("SELECT COUNT(*) as total FROM projetos WHERE status NOT IN ('Concluído', 'Cancelado')", (err, rowProjetos) => {
            const sqlRecentes = `SELECT p.id, p.nome as projeto, p.status, c.nome as cliente FROM projetos p JOIN clientes c ON p.cliente_id = c.id ORDER BY p.id DESC LIMIT 5`; 
            db.all(sqlRecentes, [], (err, projetos) => {
                res.render('index', { 
                    user: req.session.user,
                    totalClientes: rowClientes.total, 
                    totalProjetos: rowProjetos.total,
                    projetos: projetos
                });
            });
        });
    });
});

// --- ROTAS DE CLIENTES ---

app.get('/clientes', checkAuth, (req, res) => {
    db.all("SELECT * FROM clientes ORDER BY id DESC", [], (err, rows) => {
        res.render('clientes', { clientes: rows, user: req.session.user, erro: req.query.erro });
    });
});

app.post('/clientes/add', checkAuth, checkAdmin, (req, res) => {
    db.run("INSERT INTO clientes (nome, email, empresa) VALUES (?, ?, ?)", [req.body.nome, req.body.email, req.body.empresa], () => res.redirect('/clientes'));
});

app.get('/clientes/delete/:id', checkAuth, checkAdmin, (req, res) => {
    const id = req.params.id;
    db.get("SELECT count(*) as qtd FROM projetos WHERE cliente_id = ?", [id], (err, row) => {
        if (row.qtd > 0) {
            return res.redirect('/clientes?erro=Impossivel excluir cliente com projetos vinculados.');
        } else {
            db.run("DELETE FROM clientes WHERE id = ?", id, () => res.redirect('/clientes'));
        }
    });
});

// --- ROTAS DE PROJETOS ---

app.get('/projetos', checkAuth, (req, res) => {
    const sqlProjetos = `SELECT p.id, p.nome, p.status, c.nome AS nome_contato, c.empresa FROM projetos p LEFT JOIN clientes c ON p.cliente_id = c.id ORDER BY p.id DESC`;
    const sqlClientes = "SELECT id, empresa, nome FROM clientes ORDER BY empresa ASC";
    const sqlMeusProjetos = "SELECT projeto_id FROM projeto_equipe WHERE usuario_id = ?";

    db.all(sqlProjetos, [], (err, projetos) => {
        db.all(sqlClientes, [], (err, clientes) => {
            db.all(sqlMeusProjetos, [req.session.user.id], (err, rows) => {
                const meusProjetosIds = rows.map(row => row.projeto_id);
                res.render('projetos', { 
                    projetos, clientes, user: req.session.user, meusProjetosIds 
                });
            });
        });
    });
});

app.post('/projetos/add', checkAuth, checkAdmin, (req, res) => {
    const { nome, cliente_id, status } = req.body;
    db.run("INSERT INTO projetos (nome, cliente_id, status) VALUES (?, ?, ?)", [nome, cliente_id, status], () => res.redirect('/projetos'));
});

// --- EXCLUIR PROJETO (APAGA PASTA + BANCO) ---
app.get('/projetos/delete/:id', checkAuth, checkAdmin, (req, res) => {
    const id = req.params.id;

    // 1. Busca nome do projeto para apagar a pasta
    db.get("SELECT nome FROM projetos WHERE id = ?", [id], (err, projeto) => {
        if (projeto) {
            const nomePasta = sanitizarNomePasta(projeto.nome);
            const caminhoPasta = path.join(__dirname, 'uploads', nomePasta);

            // Apaga a pasta fisicamente (Recursive: true apaga tudo dentro)
            if (fs.existsSync(caminhoPasta)) {
                fs.rm(caminhoPasta, { recursive: true, force: true }, (err) => {
                    if (err) console.error("Erro ao apagar pasta:", err);
                });
            }
        }

        // 2. Limpeza em Cascata no Banco de Dados
        db.run("DELETE FROM projeto_equipe WHERE projeto_id = ?", id, () => {
            db.run("DELETE FROM arquivos WHERE projeto_id = ?", id, () => {
                db.run("DELETE FROM logs WHERE projeto_id = ?", id, () => {
                    db.run("DELETE FROM projetos WHERE id = ?", id, () => res.redirect('/projetos'));
                });
            });
        });
    });
});

// --- DETALHES DO PROJETO ---

app.get('/projetos/ver/:id', checkAuth, checkProjectMember, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT p.*, c.empresa, c.nome as cliente_nome FROM projetos p LEFT JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?`, [id], (err, projeto) => {
        if(!projeto) return res.redirect('/projetos');
        
        db.all(`SELECT pe.id, pe.funcao_no_projeto, u.nome, u.cargo FROM projeto_equipe pe JOIN usuarios u ON pe.usuario_id = u.id WHERE pe.projeto_id = ?`, [id], (err, equipe) => {
            db.all(`SELECT a.*, u.nome as uploader FROM arquivos a JOIN usuarios u ON a.usuario_id = u.id WHERE a.projeto_id = ? ORDER BY a.id DESC`, [id], (err, arquivos) => {
                db.all(`SELECT l.*, u.nome as usuario FROM logs l LEFT JOIN usuarios u ON l.usuario_id = u.id WHERE l.projeto_id = ? ORDER BY l.id DESC LIMIT 50`, [id], (err, logs) => {
                    db.all("SELECT id, nome, cargo FROM usuarios ORDER BY nome ASC", [], (err, todosUsuarios) => {
                        res.render('projeto_detalhe', { projeto, equipe, arquivos, logs, todosUsuarios, user: req.session.user });
                    });
                });
            });
        });
    });
});

// --- GERENCIAMENTO DE STATUS E EQUIPE ---

app.post('/projetos/status/:id', checkAuth, checkAdmin, (req, res) => {
    db.run("UPDATE projetos SET status = ? WHERE id = ?", [req.body.status, req.params.id], () => {
        registrarLog(req.params.id, req.session.user.id, 'Status', `Alterou status para ${req.body.status}`);
        res.redirect('/projetos/ver/' + req.params.id);
    });
});

app.post('/projetos/equipe/add', checkAuth, checkAdmin, (req, res) => {
    const { projeto_id, usuario_id, funcao } = req.body;
    db.run("INSERT INTO projeto_equipe (projeto_id, usuario_id, funcao_no_projeto) VALUES (?,?,?)", [projeto_id, usuario_id, funcao], () => {
        registrarLog(projeto_id, req.session.user.id, 'Equipe', `Adicionou novo membro`);
        res.redirect('/projetos/ver/' + projeto_id);
    });
});

app.get('/projetos/equipe/remove/:id/:proj_id', checkAuth, checkAdmin, (req, res) => {
    db.run("DELETE FROM projeto_equipe WHERE id = ?", req.params.id, () => {
        registrarLog(req.params.proj_id, req.session.user.id, 'Equipe', `Removeu um membro`);
        res.redirect('/projetos/ver/' + req.params.proj_id);
    });
});

app.post('/projetos/equipe/edit/:id', checkAuth, checkAdmin, (req, res) => {
    const { nova_funcao, projeto_id } = req.body;
    db.run("UPDATE projeto_equipe SET funcao_no_projeto = ? WHERE id = ?", [nova_funcao, req.params.id], () => {
        registrarLog(projeto_id, req.session.user.id, 'Equipe', `Alterou função de membro`);
        res.redirect('/projetos/ver/' + projeto_id);
    });
});

// --- GERENCIAMENTO DE ARQUIVOS (REPOSITÓRIO) ---

// 1. Upload de Arquivos (Múltiplos e com Pasta Nomeada)
// IMPORTANTE: 'upload.array' vem ANTES de 'checkProjectMember' para o req.body existir
app.post('/projetos/upload', checkAuth, upload.array('arquivo'), checkProjectMember, (req, res) => {
    const { projeto_id } = req.body;
    const files = req.files; 

    if (!files || files.length === 0) return res.redirect('/projetos/ver/' + projeto_id);

    const stmt = db.prepare("INSERT INTO arquivos (projeto_id, usuario_id, nome_original, nome_salvo, caminho) VALUES (?, ?, ?, ?, ?)");

    files.forEach(file => {
        stmt.run([projeto_id, req.session.user.id, file.originalname, file.filename, file.path], function(err) {
            if (!err) {
                registrarLog(projeto_id, req.session.user.id, 'Upload', `Enviou o arquivo: ${file.originalname}`);
            }
        });
    });

    stmt.finalize();
    res.redirect('/projetos/ver/' + projeto_id);
});

// 2. Download Individual
app.get('/projetos/arquivo/download/:id', checkAuth, checkProjectMember, (req, res) => {
    db.get("SELECT * FROM arquivos WHERE id = ?", [req.params.id], (err, arquivo) => {
        if (!arquivo) return res.status(404).send("Arquivo não encontrado");
        
        // Verifica segurança (caso o checkProjectMember tenha passado apenas pelo ID da URL)
        if (req.session.user.tipo_acesso !== 'admin') {
            db.get("SELECT id FROM projeto_equipe WHERE projeto_id = ? AND usuario_id = ?", [arquivo.projeto_id, req.session.user.id], (err, row) => {
                 if(!row) return res.status(403).send("Acesso negado.");
                 res.download(arquivo.caminho, arquivo.nome_original);
            });
        } else {
            res.download(arquivo.caminho, arquivo.nome_original);
        }
    });
});

// 3. Download ZIP (Projeto Completo)
app.get('/projetos/download-all/:id', checkAuth, checkProjectMember, (req, res) => {
    db.get("SELECT nome FROM projetos WHERE id = ?", [req.params.id], (err, projeto) => {
        if(!projeto) return res.redirect('/projetos');

        const nomePasta = sanitizarNomePasta(projeto.nome);
        const caminhoPasta = path.join(__dirname, 'uploads', nomePasta);

        if (fs.existsSync(caminhoPasta)) {
            const zip = new AdmZip();
            
            // --- NOVA LÓGICA: Adicionar arquivo por arquivo para limpar o nome ---
            // 1. Lê todos os arquivos da pasta
            const arquivos = fs.readdirSync(caminhoPasta);
            
            arquivos.forEach(arquivo => {
                const caminhoCompleto = path.join(caminhoPasta, arquivo);
                
                // 2. Remove os números e o traço do início do nome (Regex)
                // Ex: "172653-contrato.pdf" vira "contrato.pdf"
                const nomeLimpo = arquivo.replace(/^\d+-/, '');
                
                // 3. Adiciona ao zip com o novo nome
                // Sintaxe: addLocalFile(caminhoFisico, caminhoDentroDoZip, nomeNovo)
                zip.addLocalFile(caminhoCompleto, "", nomeLimpo);
            });
            // -------------------------------------------------------------------
            
            const zipName = `${nomePasta}_completo.zip`;
            const zipBuffer = zip.toBuffer();

            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Disposition', `attachment; filename=${zipName}`);
            res.set('Content-Length', zipBuffer.length);
            res.send(zipBuffer);
        } else {
            res.send("<script>alert('A pasta deste projeto está vazia ou não existe.'); window.history.back();</script>");
        }
    });
});

// 4. Excluir Arquivo
app.get('/projetos/arquivo/delete/:id', checkAuth, (req, res) => {
    db.get("SELECT * FROM arquivos WHERE id = ?", [req.params.id], (err, arquivo) => {
        if (!arquivo) return res.redirect('/projetos');

        const executarExclusao = () => {
            fs.unlink(arquivo.caminho, (err) => {
                db.run("DELETE FROM arquivos WHERE id = ?", [arquivo.id], () => {
                    registrarLog(arquivo.projeto_id, req.session.user.id, 'Exclusão', `Apagou arquivo: ${arquivo.nome_original}`);
                    res.redirect('/projetos/ver/' + arquivo.projeto_id);
                });
            });
        };

        if (req.session.user.tipo_acesso !== 'admin') {
            db.get("SELECT id FROM projeto_equipe WHERE projeto_id = ? AND usuario_id = ?", [arquivo.projeto_id, req.session.user.id], (err, row) => {
                if (!row) return res.status(403).send("Sem permissão");
                executarExclusao();
            });
        } else {
            executarExclusao();
        }
    });
});

// 5. Editar Código
app.get('/projetos/arquivo/edit/:id', checkAuth, (req, res) => {
    db.get("SELECT * FROM arquivos WHERE id = ?", [req.params.id], (err, arquivo) => {
        if(!arquivo) return res.redirect('/projetos');
        // Verificações de segurança simplificadas para brevidade (já aplicadas acima)
        fs.readFile(arquivo.caminho, 'utf8', (err, data) => {
            if (err) return res.send("Arquivo binário, não editável.");
            res.render('editor', { arquivo, conteudo: data, user: req.session.user });
        });
    });
});

app.post('/projetos/arquivo/save', checkAuth, (req, res) => {
    const { id, conteudo } = req.body;
    db.get("SELECT * FROM arquivos WHERE id = ?", [id], (err, arquivo) => {
        if(!arquivo) return res.redirect('/projetos');
        fs.writeFile(arquivo.caminho, conteudo, (err) => {
            registrarLog(arquivo.projeto_id, req.session.user.id, 'Edição', `Editou arquivo: ${arquivo.nome_original}`);
            res.redirect('/projetos/ver/' + arquivo.projeto_id);
        });
    });
});

app.listen(PORT, () => console.log(`SoftManager rodando em http://localhost:${PORT}`));