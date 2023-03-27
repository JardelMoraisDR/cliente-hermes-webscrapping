const express = require('express');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const app = express();
const port = process.env.PORT || 3000;

const fixedUrl = 'https://www.diariomunicipal.com.br/amupe/pesquisar?busca_avancada[__paper]=1&busca_avancada[entidadeUsuaria]={!MUNICIPIO!}&busca_avancada[nome_orgao]=&busca_avancada[titulo]=&busca_avancada[texto]=&busca_avancada[dataInicio]={!DATAINICIO!}&busca_avancada[dataFim]={!DATAFIM!}'; // Substitua pela URL fixada no código

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

async function extractDataFromCurrentPage(driver){
        
        const data = [];
        const tableRows = await driver.findElements(By.css('#datatable tbody tr'));
        
        for (let i = 0; i < tableRows.length; i++) {      
            const rowData = await retryOperation(async () => {
                const row = await driver.findElement(By.css(`#datatable tbody tr:nth-child(${i + 1})`));

                const cells = await row.findElements(By.tagName('td'));

                const etidadeElement = await cells[0].findElement(By.tagName('a'));
                const tituloElement = await cells[1].findElement(By.tagName('a'));
                const orgaoElement = await cells[2].findElement(By.tagName('a'));
                const dataElement = await cells[3].findElement(By.tagName('a'));

                const etidade = await etidadeElement.getText();
                const titulo = await tituloElement.getText();
                const orgao = await orgaoElement.getText();
                const dataCirculacao = await dataElement.getText();
                return { etidade, titulo, orgao, dataCirculacao };
            });
            
            if(rowData){
                data.push(rowData);
            }
        }

    return data;

}

function obterDataAtual(){
    const data = new Date();

    const dia = data.getDate().toString().padStart(2, "0");
    const mes = (data.getMonth() + 1).toString().padStart(2, "0");
    const ano = data.getFullYear();

    return `${dia}/${mes}/${ano}`;
}

app.get('/consultar', async (req, res) => {
  const { codMunicipio, dataInicio, dataFim } = req.query;

  var url = fixedUrl;
  if(codMunicipio){
    url = url.replace('{!MUNICIPIO!}', codMunicipio);
  }else{
    url = url.replace('{!MUNICIPIO!}', '');
  }

  const dataAtual = encodeURIComponent(obterDataAtual());

  if(dataInicio){
    var dataInicioTemp = encodeURIComponent(dataInicio);
    url = url.replace('{!DATAINICIO!}', dataInicioTemp);
  }else{
    url = url.replace('{!DATAINICIO!}', dataAtual);
  }

  if(dataFim){
    var dataFimTemp = encodeURIComponent(dataFim);
    url = url.replace('{!DATAFIM!}', dataFimTemp);
  }else{
    url = url.replace('{!DATAFIM!}', dataAtual);
  }

  let options = new chrome.Options();
    options = options//.headless()
    .addArguments('--disable-gpu')
    .addArguments('--ignore-certificate-errors');
    
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await driver.get(url);

    const btnEnviar = await driver.findElement(By.id('busca_avancada_Enviar'));
    await btnEnviar.click();

    const allData = [];
    while(true){

        const currentPageData = await retryOperation(async () => {           
            // Aguarde até que a tabela esteja presente na página
            await driver.wait(until.elementLocated(By.id('datatable')), 10000);

            const currentPageTable = await driver.findElement(By.css("#datatable"));
            return await extractDataFromCurrentPage(currentPageTable);
        });
        
        allData.push(currentPageData);

        await driver.wait(until.elementLocated(By.id('datatable_next')), 10000);

        const btnProximo = await driver.findElement(By.id('datatable_next'));

        const elementClasses = await btnProximo.getAttribute('class');

        const targetClass = 'disabled'; 
        const hasTargetClass = elementClasses.split(' ').includes(targetClass);

        if(hasTargetClass){
            break;
        }

        await btnProximo.click();

    }

    res.json(allData);

  } catch (error) {
    res.status(500).send(`Erro ao extrair dados: ${error.message}`);
  } finally {
    await driver.quit();
  }
});

app.listen(port, () => {
  const currentDate = new Date();
  console.log("[" + currentDate.toLocaleString() + `] Servidor rodando em http://localhost:${port}`);
});
