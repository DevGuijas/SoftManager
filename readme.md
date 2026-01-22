# SoftManager - Sistema de Gestão de Projetos

O **SoftManager** é uma aplicação web Full Stack desenvolvida para simplificar a gestão de projetos, clientes e equipes. O sistema centraliza o fluxo de trabalho, permitindo controle de status, repositório de arquivos com versionamento seguro e logs de auditoria para rastreabilidade de ações.

## Funcionalidades Principais

### Dashboard e Gestão
- **Visão Geral:** Métricas em tempo real sobre clientes, projetos ativos e conclusões.
- **Gestão de Clientes:** CRUD completo (Create, Read, Update, Delete) com validação de dependências.
- **Workflow de Projetos:** Controle de status (Pendente, Em Andamento, Concluído, Cancelado).

### Repositório de Arquivos Inteligente
- **Upload Seguro:** Armazenamento físico com *Timestamp* para evitar conflitos de nomes (`timestamp-arquivo.pdf`).
- **Download Limpo:** O usuário baixa o arquivo com o nome original, sem os prefixos do sistema.
- **Download em Lote (.zip):** Funcionalidade exclusiva que compila todos os arquivos do projeto em um ZIP, limpando os nomes automaticamente antes do download.
- **Editor de Código:** Visualização e edição rápida de arquivos de texto/código (HTML, JS, CSS, JSON) direto no navegador.

### Controle de Acesso e Equipe
- **Autenticação:** Sistema de Login e Logout com sessões seguras.
- **RBAC (Role-Based Access Control):** Diferenciação entre **Admin** (acesso total) e **Membros** (acesso restrito aos projetos vinculados).
- **Logs de Auditoria:** Rastreamento detalhado de quem fez o quê e quando (ex: "Usuário X apagou arquivo Y").

## Tecnologias Utilizadas

- **Back-end:** Node.js, Express.js
- **Banco de Dados:** SQLite (Leve e eficiente para a estrutura atual)
- **Front-end:** EJS (Embedded JavaScript Templating), CSS3 customizado
- **Manipulação de Arquivos:** Multer (Uploads), AdmZip (Compressão), File System (fs)
- **Segurança:** Express-Session, validação de inputs e sanitização de nomes de pastas.

## Como rodar o projeto

### Pré-requisitos
- Node.js instalado

### Instalação

1. Clone o repositório:
   ```bash
   git clone [https://github.com/devguijas/softmanager.git](https://github.com/devguijas/softmanager.git)