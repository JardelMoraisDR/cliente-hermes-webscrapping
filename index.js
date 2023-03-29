const express = require('express');
const ac = require('@antiadmin/anticaptchaofficial');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000;
const currentDate = new Date();

// Define a chave da API do Anti-Captcha
ac.setAPIKey('6a1719f10908bb954dbc1694e22126b8');
// ac.setSoftId(0);

const fixedUrl = 'https://www.diariomunicipal.com.br/amupe/pesquisar?busca_avancada[__paper]=1&busca_avancada[entidadeUsuaria]={!MUNICIPIO!}&busca_avancada[nome_orgao]=&busca_avancada[titulo]=&busca_avancada[texto]=&busca_avancada[dataInicio]={!DATAINICIO!}&busca_avancada[dataFim]={!DATAFIM!}'; // Substitua pela URL fixada no código
const paramAdd = '&g-recaptcha-response={!TOKEN!}&busca_avancada%5B_token%5D=5IA5wYS0R07946saEn3KN5iRrbFwqkYCs4ghs8HQx5s'

async function retryOperation(operation, retries = 3) {
    try {
        return await operation();
    } catch (error) {
        if (retries <= 0) {
            throw error;
        }
        return retryOperation(operation, retries - 1);
    }
}

async function extractDataFromCurrentPage(page) {
    const data = [];
    const tableRows = await page.$$('#datatable tbody tr');

    for (let i = 0; i < tableRows.length; i++) {
        const rowData = await retryOperation(async () => {
            const row = tableRows[i];

            const entidadeElement = await row.$eval('td:nth-child(1) a', a => a.textContent);
            const tituloElement = await row.$eval('td:nth-child(2) a', a => a.textContent);
            const orgaoElement = await row.$eval('td:nth-child(3) a', a => a.textContent);
            const dataElement = await row.$eval('td:nth-child(4) a', a => a.textContent);
            const linkElement = await row.$eval('td:nth-child(5) a', a => a.href);

            return {
                entidade: entidadeElement,
                titulo: tituloElement,
                orgao: orgaoElement,
                dataCirculacao: dataElement,
                link: linkElement
            };
        });

        if (rowData) {
            data.push(rowData);
        }
    }

    return data;
}

async function getTokenAntiCaptcha(url, noToken){
    
    if(noToken === '0'){
      return;
    }

    await ac.getBalance()
    .then(balance => console.log("[" + currentDate.toLocaleString() + '] Saldo da conta: '+balance))
    .catch(error => console.log("[" + currentDate.toLocaleString() + '] an error with API key: '+error));

    // Solicita o token do Anti-Captcha para resolver o reCAPTCHA V2
    console.log("[" + currentDate.toLocaleString() + '] Resolvendo recaptcha ...');
    const token = await ac.solveRecaptchaV2Proxyless(
      url,
      '6LeDwWMUAAAAALhHrdTL_WR7iuHBdYAjtPn8VOaW'
    );

    return token;

}

function obterDataAtual(){
    const data = new Date();

    const dia = data.getDate().toString().padStart(2, "0");
    const mes = (data.getMonth() + 1).toString().padStart(2, "0");
    const ano = data.getFullYear();

    return `${dia}/${mes}/${ano}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/consultar', async (req, res) => {
    const {
        codMunicipio,
        dataInicio,
        dataFim,
        noToken,
        noHeadless
    } = req.query;

    var url = fixedUrl;
    if (codMunicipio) {
        url = url.replace('{!MUNICIPIO!}', codMunicipio);
    } else {
        url = url.replace('{!MUNICIPIO!}', '');
    }

    const dataAtual = encodeURIComponent(obterDataAtual());

    if (dataInicio) {
        var dataInicioTemp = encodeURIComponent(dataInicio);
        url = url.replace('{!DATAINICIO!}', dataInicioTemp);
    } else {
        url = url.replace('{!DATAINICIO!}', dataAtual);
    }

    if (dataFim) {
        var dataFimTemp = encodeURIComponent(dataFim);
        url = url.replace('{!DATAFIM!}', dataFimTemp);
    } else {
        url = url.replace('{!DATAFIM!}', dataAtual);
    }

    const browserOptions = {
        headless: noHeadless !== '0'
    };

    const browser = await puppeteer.launch(browserOptions);
    const page = await browser.newPage();
    
    var allData = [];
    var token;
    var tentativas = 2;
    var limiteTentativas = 3;
    try {
        while(tentativas <= limiteTentativas){
            if(noToken != '0' && tentativas === 2){
                token = await getTokenAntiCaptcha(url, noToken);
                console.log("[" + currentDate.toLocaleString() + '] Token resultado:' + token);
            }
            
            var urlTemp = url;
    
            if(noToken != '0' && tentativas === 2){
                var parameters = paramAdd;
                urlTemp = urlTemp + parameters.replace('{!TOKEN!}', token);
            }
    
            await page.goto(urlTemp);
    
            if(noToken != '0' && tentativas === 2){
                await sleep(2000);

                const novoValor = token;
                const iframesList = await page.frames();
                // Percorre cada iframe na página
                for(const idElemento of ['g-recaptcha-response-1', 'g-recaptcha-response']){
                    for (const iframe of iframesList) {
                        // Verifica se o elemento com o ID especificado existe dentro do iframe
                        const elemento = await iframe.$(`#${idElemento}`);
                        if (elemento) {
                            // Atualiza o valor do elemento com o novo valor
                            await iframe.$eval(`#${idElemento}`, (el, novoHTML) => {
                                el.innerHTML = novoHTML;
                              }, novoValor);
                              
                            console.log(`O elemento com o ID "${idElemento}" foi atualizado no iframe "${iframe.name()}"`);
                        }
                    }
                }
            }
             
            await sleep(3000);
    
            const btnEnviar = await page.$('#busca_avancada_Enviar');
            await btnEnviar.click();
    
            if (tentativas === 3) {
                console.log("1 minuto para resolver o captcha.");
                await sleep(60000);
                console.log("Tempo encerrado.");
            }

            while (true) {
    
                console.log("Obtendo dados da página...");
                const currentPageData = await retryOperation(async () => {
                    return await extractDataFromCurrentPage(page);
                });
                
                if(typeof currentPageData !== 'undefined' && currentPageData.length > 0){
                    allData.push(currentPageData);
                }else{
                    tentativas++;
                    break;
                }

                if (typeof allData !== 'undefined' && typeof allData[0] !== 'undefined') {
                    if(allData.length <= 0 || allData[0].length <= 0){
                        allData = [];
                        tentativas++;
                        break;   
                    }
                }
    
                const hasClass = await page.evaluate((selector, className) => {
                    const element = document.querySelector(selector);
                    if (!element) return false; // Verifica se o elemento existe
                    return element.classList.contains(className);
                  }, '#datatable_next', 'disabled');
                  
                if (hasClass) {
                    break;
                } 
                                   
                const btnProximo = await page.$('#datatable_next');
                await btnProximo.click();

            }

            if (typeof allData !== 'undefined' && typeof allData[0] !== 'undefined') {
                if(allData.length > 0 || allData[0].length > 0){
                    tentativas++;
                    break;
                }
            }
                
        }
        console.log(allData.flat());
        res.json(allData.flat());
    } catch (error) {
        res.status(500).send(`Erro ao extrair dados: ${error.message}`);
    } finally {
        await browser.close();
    }
});

app.listen(port, () => {
    console.log("[" + currentDate.toLocaleString() + `] Servidor rodando em http://localhost:${port}`);
});
  