const express = require('express');
const ac = require('@antiadmin/anticaptchaofficial');
const {
    Builder,
    By,
    until
} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

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

async function extractDataFromCurrentPage(driver) {

    const data = [];
    // const tableRows = await driver.findElements(By.css('#datatable tbody tr'));
    const tableRows = await driver.executeScript('return document.querySelectorAll("#datatable tbody tr");');

    for (let i = 0; i < tableRows.length; i++) {
        const rowData = await retryOperation(async () => {
            const row = await driver.findElement(By.css(`#datatable tbody tr:nth-child(${i + 1})`));

            const cells = await row.findElements(By.tagName('td'));

            const entidadeElement = await cells[0].findElement(By.tagName('a'));
            const tituloElement = await cells[1].findElement(By.tagName('a'));
            const orgaoElement = await cells[2].findElement(By.tagName('a'));
            const dataElement = await cells[3].findElement(By.tagName('a'));
            const linkElement = await cells[4].findElement(By.tagName('a'));

            const entidade = await entidadeElement.getText();
            const titulo = await tituloElement.getText();
            const orgao = await orgaoElement.getText();
            const dataCirculacao = await dataElement.getText();
            const link = await linkElement.getAttribute('href');

            return {
                entidade,
                titulo,
                orgao,
                dataCirculacao,
                link
            };
        });

        if (rowData) {
            data.push(rowData);
        }
    }

    return data;

}

async function getTokenAntiCaptcha(url, noToken) {

    if (noToken === '0') {
        return;
    }

    await ac.getBalance()
        .then(balance => console.log("[" + currentDate.toLocaleString() + '] Saldo da conta: ' + balance))
        .catch(error => console.log("[" + currentDate.toLocaleString() + '] an error with API key: ' + error));

    // Solicita o token do Anti-Captcha para resolver o reCAPTCHA V2
    console.log("[" + currentDate.toLocaleString() + '] Resolvendo recaptcha ...');
    const token = await ac.solveRecaptchaV2Proxyless(
        url,
        '6LeDwWMUAAAAALhHrdTL_WR7iuHBdYAjtPn8VOaW'
    );

    return token;

}

function obterDataAtual() {
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

    let options = new chrome.Options();

    if (noHeadless === '0') {
        options = options
            .addArguments('--disable-gpu')
            .addArguments('--ignore-certificate-errors')
            .addArguments('--window-size=1360,1000');
        console.log("[" + currentDate.toLocaleString() + "] Sem headless");
    } else {
        options = options
            .addArguments('--headless')
            .addArguments('--disable-gpu')
            .addArguments('--ignore-certificate-errors')
            .addArguments(`--user-agent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36\"`)
            .addArguments('--window-size=1360,1000');
        console.log("[" + currentDate.toLocaleString() + "] Com headless");
    }

    const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    
    var token = "jardel";
    var allData = [];
    var tentativas = 2;
    var limiteTentativas = 3;
    try {
        while (tentativas <= limiteTentativas) {
            if (tentativas === 2) {
                // token = await getTokenAntiCaptcha("https://www.diariomunicipal.com.br/amupe/pesquisar", noToken);
                console.log("[" + currentDate.toLocaleString() + '] Token resultado:' + token);
            }

            var urlTemp = url;

            if (noToken != '0' && tentativas === 2) {
                var parameters = paramAdd;
                urlTemp = urlTemp + parameters.replace('{!TOKEN!}', token);
            }

            await driver.get(urlTemp);
            if (noToken != '0' && tentativas === 2) {
                await driver.sleep(2000);

                const idElemento = 'g-recaptcha-response';
                const novoValor = token;

                const iframesList = await driver.findElements(By.tagName('iframe'));

                for (const iframe of iframesList) {
                  try {
                    await driver.switchTo().frame(iframe);
                    const elemento = await driver.findElement(By.id(idElemento));
                    await driver.executeScript("arguments[0].value = arguments[1];", elemento, novoValor);
                    console.log(`O elemento com o ID "${idElemento}" foi atualizado no iframe "${iframe.getWebElement().getAttribute('name')}"`);
                  } catch (err) {
                    // Se ocorrer um erro, imprima a mensagem de erro no console
                    console.error(err);
                  } finally {
                    // Saia do iframe atual e retorne ao contexto padrão do driver
                    await driver.switchTo().defaultContent();
                  }
                }
                
            }

            await sleep(5000);

            const btnEnviar = await driver.findElement(By.id('busca_avancada_Enviar'));
            await btnEnviar.click();

            if (tentativas === 3) {
                console.log("10 segundos para resolver o captcha.");
                await sleep(10000);
                console.log("Tempo encerrado.");
            }

            while (true) {

                const currentPageData = await retryOperation(async () => {
                    return await extractDataFromCurrentPage(driver);
                });

                allData.push(currentPageData);
                if (typeof allData !== 'undefined' && (allData.length <= 0 || allData[0].length <= 0)) {
                    allData = [];
                    tentativas++;
                    break;
                }

                await driver.wait(until.elementLocated(By.id('datatable_next')), 10000);

                const btnProximo = await driver.findElement(By.id('datatable_next'));

                const elementClasses = await btnProximo.getAttribute('class');

                const targetClass = 'disabled';
                const hasTargetClass = elementClasses.split(' ').includes(targetClass);

                if (hasTargetClass) {
                    break;
                }

                await sleep(1000);
                await driver.executeScript('arguments[0].click();', btnProximo);

            }

            if (typeof allData !== 'undefined' && (allData.length > 0 || allData[0].length > 0)) {
                tentativas++;
                break;
            }

        }

        res.json(allData.flat());
    } catch (error) {
        res.status(500).send(`Erro ao extrair dados: ${error.message}`);
    } finally {
        await driver.quit();
    }
});

app.listen(port, () => {
    console.log("[" + currentDate.toLocaleString() + `] Servidor rodando em http://localhost:${port}`);
});