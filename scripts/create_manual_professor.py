"""Generate the teacher-facing EduPlan guide with local product screenshots."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Flowable, Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SCREEN = ROOT / "tmp" / "pdfs" / "eduplan-inicio.png"
OUTPUT = ROOT / "output" / "pdf" / "manual-do-professor-eduplan.pdf"
GREEN = colors.HexColor("#245747")
INK = colors.HexColor("#29332F")
MUTED = colors.HexColor("#626C67")
LINE = colors.HexColor("#DDE4DF")
PALE = colors.HexColor("#F2F6F3")
WARM = colors.HexColor("#FFF5E1")


class ScreenshotCrop(Flowable):
    """Draw a clipped crop of a screenshot without writing another image file."""

    def __init__(self, path, crop, width):
        super().__init__()
        self.image = ImageReader(str(path))
        self.source_width, self.source_height = self.image.getSize()
        self.left, self.top, self.crop_width, self.crop_height = crop
        self.width = width
        self.height = width * self.crop_height / self.crop_width

    def wrap(self, available_width, available_height):
        return self.width, self.height

    def draw(self):
        scale = self.width / self.crop_width
        source_bottom = self.source_height - self.top - self.crop_height
        canvas = self.canv
        canvas.saveState()
        path = canvas.beginPath()
        path.rect(0, 0, self.width, self.height)
        canvas.clipPath(path, stroke=0, fill=0)
        canvas.drawImage(
            self.image,
            -self.left * scale,
            -source_bottom * scale,
            width=self.source_width * scale,
            height=self.source_height * scale,
            mask="auto",
        )
        canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("ManualTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=27,
                                leading=32, textColor=INK, spaceAfter=10),
        "subtitle": ParagraphStyle("ManualSubtitle", parent=base["BodyText"], fontName="Helvetica", fontSize=12,
                                   leading=18, textColor=MUTED, spaceAfter=16),
        "h1": ParagraphStyle("ManualH1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=18,
                              leading=23, textColor=GREEN, spaceBefore=4, spaceAfter=10),
        "h2": ParagraphStyle("ManualH2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13,
                              leading=17, textColor=INK, spaceBefore=9, spaceAfter=5),
        "body": ParagraphStyle("ManualBody", parent=base["BodyText"], fontName="Helvetica", fontSize=10.3,
                                leading=15.2, textColor=INK, spaceAfter=7),
        "small": ParagraphStyle("ManualSmall", parent=base["BodyText"], fontName="Helvetica", fontSize=8.5,
                                 leading=11.5, textColor=MUTED),
        "label": ParagraphStyle("ManualLabel", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=8.5,
                                 leading=11, textColor=GREEN, alignment=TA_CENTER),
        "center": ParagraphStyle("ManualCenter", parent=base["BodyText"], fontName="Helvetica", fontSize=10,
                                  leading=14, textColor=MUTED, alignment=TA_CENTER),
    }


S = styles()


def p(text, style="body"):
    return Paragraph(text, S[style])


def section(title, intro=None):
    items = [p(title, "h1")]
    if intro:
        items.append(p(intro))
    return items


def bullet(text):
    return p("- " + text)


def note(title, text, warm=False):
    table = Table([[p("<b>" + title + "</b><br/>" + text)]], colWidths=[16.7 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARM if warm else PALE),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 13), ("RIGHTPADDING", (0, 0), (-1, -1), 13),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


def card_grid(cards, columns=2):
    rows = []
    for index in range(0, len(cards), columns):
        row = []
        for title, text in cards[index:index + columns]:
            row.append(p("<b>" + title + "</b><br/>" + text))
        while len(row) < columns:
            row.append("")
        rows.append(row)
    table = Table(rows, colWidths=[8.2 * cm] * columns, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def caption(text):
    return p(text, "small")


def header_footer(canvas, document):
    canvas.saveState()
    page = canvas.getPageNumber()
    if page > 1:
        canvas.setStrokeColor(LINE)
        canvas.line(document.leftMargin, A4[1] - 1.3 * cm, A4[0] - document.rightMargin, A4[1] - 1.3 * cm)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(document.leftMargin, A4[1] - 1.0 * cm, "EduPlan - Manual do professor")
        canvas.drawRightString(A4[0] - document.rightMargin, 0.75 * cm, f"Página {page}")
    canvas.restoreState()


def build():
    if not SCREEN.is_file():
        raise FileNotFoundError("A captura local do EduPlan não foi encontrada.")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, rightMargin=2 * cm, leftMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=1.7 * cm,
        title="Manual do professor - EduPlan", author="EduPlan",
    )
    story = []

    story.extend([Spacer(1, 2.2 * cm), p("Manual do professor", "title"),
                  p("EduPlan - assistente de Inteligência Artificial para apoiar o planejamento e a rotina docente.", "subtitle")])
    cover = Table([[p("<b>O que este manual mostra</b><br/>Como entrar, iniciar uma conversa, usar os oito atalhos, anexar materiais, ditar, revisar respostas e baixar produções."),
                    p("<b>Para quem é</b><br/>Professores do Ensino Fundamental I, Fundamental II e Ensino Médio, com diferentes níveis de familiaridade com tecnologia.")]], colWidths=[8.2 * cm, 8.2 * cm])
    cover.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                               ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 14),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 14), ("TOPPADDING", (0, 0), (-1, -1), 14),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 14)]))
    story += [cover, Spacer(1, .8 * cm), note("Princípio importante", "O EduPlan apresenta propostas para a revisão do professor. Evite inserir nomes, diagnósticos ou outros dados pessoais dos alunos.", warm=True), Spacer(1, 5.3 * cm), p("Versão do protótipo para apresentação acadêmica - 6 de novembro de 2026", "center"), PageBreak()]

    story += section("1. Conheça a tela inicial", "A tela inicial reúne as decisões mais importantes antes de começar: disciplina, turma, ementa e o tipo de apoio desejado.")
    image = Image(str(SCREEN), width=16.7 * cm, height=11.6 * cm)
    story += [image, caption("Imagem 1 - Tela inicial real do EduPlan. Os dados exibidos são genéricos, sem informações de professores ou alunos."), Spacer(1, .3 * cm)]
    story += [bullet("Use Nova conversa para iniciar um novo assunto sem misturar referências."),
              bullet("Escolha disciplina, turma e, se disponível, uma ementa de referência."),
              bullet("Clique em um dos oito atalhos ou escreva diretamente no campo de conversa."),
              note("Sem ementa?", "O EduPlan continua ajudando. Ele apenas não afirma alinhamento curricular sem uma referência cadastrada.")]
    story.append(PageBreak())

    story += section("2. Comece uma conversa", "O sistema foi pensado para não exigir que o professor conheça comandos técnicos.")
    story += [p("Passo a passo", "h2"), bullet("Clique em Continuar com o Google e entre com sua conta."),
              bullet("No primeiro acesso, informe seu nome. Disciplina e turma podem ser ajustadas depois."),
              bullet("Escolha um atalho, por exemplo Adaptar atividades, ou escreva o que precisa."),
              bullet("Envie a mensagem e acompanhe os três pontos enquanto o EduPlan prepara a proposta.")]
    story += [Spacer(1, .25 * cm), ScreenshotCrop(SCREEN, (280, 70, 1120, 150), 16.2 * cm), caption("Imagem 2 - Barra de contexto: disciplina, turma e ementa ficam visíveis durante o preparo da aula."), Spacer(1, .35 * cm),
              ScreenshotCrop(SCREEN, (420, 825, 850, 145), 14.1 * cm), caption("Imagem 3 - Campo de conversa com anexo, ditado e envio."),
              note("Dica", "Escreva como você explicaria a necessidade para outra professora. O EduPlan fará apenas as perguntas que ainda faltarem.")]
    story.append(PageBreak())

    story += section("3. Escolha a ajuda que precisa", "Os atalhos começam uma conversa no mesmo chat. Todos usam o contexto de disciplina, turma, ementa e mensagens anteriores.")
    story.append(card_grid([
        ("Adaptar atividades", "Ajusta linguagem, etapas, exemplos, apoios e formas de resposta, preservando o objetivo pedagógico."),
        ("Organizar planejamento", "Estrutura plano de aula, sequência didática, semana ou cronograma."),
        ("Corrigir e revisar", "Revisa textos, enunciados e respostas, distinguindo linguagem e conteúdo."),
        ("Elaborar relatórios", "Organiza observações reais sem inventar desempenho ou diagnósticos."),
        ("Criar materiais", "Produz textos, resumos, guias e roteiros de apresentações."),
        ("Elaborar provas", "Cria questões, gabarito e critérios de correção quando necessários."),
        ("Gerar exercícios", "Monta prática, fixação, aplicação ou revisão com instruções claras."),
        ("Sugerir dinâmicas", "Propõe estratégias considerando idade, tempo, recursos e participação."),
    ]))
    story += [Spacer(1, .4 * cm), ScreenshotCrop(SCREEN, (420, 380, 850, 390), 14.1 * cm), caption("Imagem 4 - Os oito atalhos aparecem compactos na tela inicial."),
              p("Durante a conversa", "h2"), bullet("Use Editar e reenviar em uma pergunta já enviada quando quiser reformular seu pedido."),
              bullet("Use Copiar resposta para levar uma proposta para outro documento."),
              bullet("As ações Simplificar linguagem, Ajustar dificuldade e Incluir gabarito aparecem quando houver material gerado.")]
    story.append(PageBreak())

    story += section("4. Use ementas, arquivos e materiais", "A ementa é uma referência curricular. Arquivos de atividade enviados no chat são tratados como materiais de apoio, não como regras do sistema.")
    story += [p("Ementas", "h2"), bullet("Em Minhas ementas, cadastre PDF com texto, DOCX ou TXT de até 3 MB."),
              bullet("Uma atualização cria uma nova versão. Conversas anteriores continuam ligadas à versão utilizada."),
              bullet("Ao trocar de ementa durante uma conversa, o EduPlan sugere iniciar outra conversa para preservar o histórico."),
              p("Materiais e downloads", "h2"), bullet("Materiais produzidos ficam em Meus materiais e permanecem vinculados à conversa."),
              bullet("Baixe em Word, PDF ou TXT. Atividades de aluno e orientações do professor podem ser baixadas separadamente."),
              note("Sobre arquivos", "PDFs digitalizados sem texto extraível não são compreendidos nesta versão. Nesse caso, envie um PDF com texto, DOCX ou TXT.", warm=True)]
    story.append(PageBreak())

    story += section("5. Dite e revise antes de enviar", "O microfone transforma fala em texto. A mensagem sempre pode ser revisada e editada antes do envio.")
    story += [bullet("Clique em Ditar e permita o uso do microfone no navegador."), bullet("Fale normalmente e clique em Parar."),
              bullet("Leia a transcrição, corrija se necessário e só então clique em Enviar."),
              bullet("Se o navegador não for compatível ou a permissão for recusada, continue digitando normalmente."),
              note("Privacidade", "O reconhecimento de voz pode usar o serviço do navegador. O EduPlan não inicia uma conversa por voz nem envia automaticamente a transcrição.")]
    story.append(PageBreak())

    story += section("6. Como o EduPlan é implementado", "A arquitetura é simples, com serviços reais e separados por responsabilidade.")
    architecture = Table([[p("<b>Professor</b><br/>Navegador responsivo"), p("<b>EduPlan</b><br/>FastAPI no servidor"), p("<b>Gemini</b><br/>Geração de propostas")]],
                         colWidths=[5.2 * cm, 6.1 * cm, 5.2 * cm])
    architecture.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), .7, LINE),
                                      ("INNERGRID", (0, 0), (-1, -1), .7, LINE), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                      ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 11),
                                      ("RIGHTPADDING", (0, 0), (-1, -1), 11), ("TOPPADDING", (0, 0), (-1, -1), 15),
                                      ("BOTTOMPADDING", (0, 0), (-1, -1), 15)]))
    story += [architecture, Spacer(1, .3 * cm), p("O navegador conversa somente com o backend EduPlan. As chamadas ao Gemini não saem do navegador e as chaves de IA não são devolvidas ao professor."),
              p("Componentes", "h2"), bullet("Frontend: HTML, CSS e JavaScript responsivos, com navegação por teclado e mensagens acessíveis."),
              bullet("Backend: FastAPI valida a sessão, aplica as regras pedagógicas e chama o Gemini."),
              bullet("IA: Gemini configurável por variável de ambiente, com respostas estruturadas e limpeza de marcadores de formatação."),
              bullet("Dados: Supabase oferece autenticação Google, PostgreSQL, controle de acesso por linha e armazenamento privado."),
              bullet("Publicação: Vercel executa o FastAPI; dados e arquivos ficam fora das funções da Vercel.")]
    story.append(PageBreak())

    story += section("7. Segurança e persistência", "A conta de cada professor é separada e os dados não dependem apenas do navegador.")
    story.append(card_grid([
        ("Login", "OAuth do Google no Supabase. O backend valida o token em cada requisição."),
        ("Isolamento", "Políticas RLS e filtros de proprietário impedem acesso a conversas, ementas, arquivos e materiais de outra pessoa."),
        ("Arquivos", "O bucket é privado. Downloads passam pela autenticação, sem links públicos permanentes."),
        ("Chave pessoal", "Pode ser salva criptografada no servidor. Nunca retorna ao navegador e não tem troca automática pela chave do projeto."),
        ("Histórico", "Conversas, versões de ementa e materiais ficam persistidos no PostgreSQL."),
        ("Limites", "Há limite diário por professor para a chave compartilhada e uma geração por vez por conta."),
    ]))
    story += [Spacer(1, .4 * cm), note("Cuidados do professor", "Não inclua dados pessoais de alunos. Revise todo material antes do uso e confirme regras institucionais para avaliações e relatórios.", warm=True)]
    story.append(PageBreak())

    story += section("8. Como colocar em funcionamento", "A instalação está preparada para execução local e publicação na Vercel.")
    story += [p("Configuração inicial", "h2"), bullet("Crie o projeto no Supabase e aplique a migração em supabase/migrations/001_eduplan.sql."),
              bullet("Configure o provedor Google no Supabase e o redirecionamento OAuth do seu projeto."),
              bullet("Copie .env.example para .env e preencha URL Supabase, chave pública, segredo administrativo, Gemini e segredo de criptografia."),
              bullet("Instale requirements.txt e execute iniciar.cmd ou uvicorn app:app --host 127.0.0.1 --port 8000."),
              p("Publicação", "h2"), bullet("Envie o código para um repositório privado, sem .env, fontes licenciadas, .venv ou node_modules."),
              bullet("Importe na Vercel como FastAPI e cadastre as variáveis privadas no painel de ambiente."),
              bullet("Adicione a URL HTTPS publicada ao Supabase e ao Google OAuth. Teste com duas contas antes da apresentação."),
              note("Antes de apresentar", "Teste login, uma ementa, uma adaptação, a exportação e o histórico. Confirme o microfone no navegador que será usado no dia.")]
    story.append(PageBreak())

    story += section("Roteiro rápido de demonstração", "Uma apresentação de cinco minutos pode seguir esta ordem.")
    story += [bullet("Entre com o Google e mostre que o perfil é individual."), bullet("Abra uma ementa de exemplo e selecione a referência."),
              bullet("Clique em Adaptar atividades, descreva uma necessidade sem dados pessoais e envie."), bullet("Mostre os três pontos, a proposta organizada e Editar e reenviar."),
              bullet("Abra o material, use uma ação de ajuste e baixe em PDF ou Word."),
              bullet("Abra Meus materiais e mostre que a produção ficou salva."),
              note("Encerramento", "O EduPlan reduz o tempo de preparação, mas mantém o professor como responsável pelas decisões pedagógicas.")]

    document.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    build()
