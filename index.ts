import cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import Excel from 'exceljs';

// TODO:
// format column width
// add lines between collection dates
// format shading for if same-day numbers change up or down
// get same data for hospitalizations and deaths, etc.

const todaysDate = new Date().toLocaleDateString('en-us', { year: '2-digit', month: '2-digit', day: '2-digit' });
// const url = 'https://app.powerbigov.us/view?r=eyJrIjoiYjZhZjQ4YWQtYWJiYS00ODI4LTg0ODYtN2I0MmFkMTBhN2U2IiwidCI6IjExZDBlMjE3LTI2NGUtNDAwYS04YmEwLTU3ZGNjMTI3ZDcyZCJ9';
const url = 'https://www.doh.wa.gov/Emergencies/COVID19/DataDashboard';

export const scrape = async (): Promise<void> => {
  const browser = await puppeteer.launch(); // add no-sandbox later
  const page = await browser.newPage();
  const fourMinInMS = 4 * 60 * 100;
  await page.goto(url, { timeout: fourMinInMS, waitUntil: 'domcontentloaded' });
  await new Promise((res) => setTimeout(res, 10 * 1000));
  const intContent = await page.content();
  const int$ = cheerio.load(intContent);
  const iframeUrl = int$('#CovidDashboardFrame')[0].attribs.src;
  page.goto(iframeUrl, { timeout: fourMinInMS, waitUntil: 'domcontentloaded' });
  await new Promise((res) => setTimeout(res, 10 * 1000));

  await page.click(
    'div[aria-label*="Bookmark Button Enter here for the epidemiologic curves of confirmed cases, hospitalizations and deaths. Epidemiologic Curves"]',
  );
  await new Promise((res) => setTimeout(res, 5 * 1000));
  const html = await page.content();
  const $ = cheerio.load(html);
  await browser.close();
  const allRectangles = $('rect[data-automation-type*="column-chart-rect"]');
  const incompleteDatesSet = new Set();
  let peakCaseCount = { cases: 0, date: new Date() };
  const results = Object.values(allRectangles)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((rect: any) => !(rect?.attribs === undefined || rect.attribs['aria-label'] === undefined))
    .map((rect) => {
      const label = rect.attribs['aria-label'];
      const nestedArr = label.split('.').map((str: string) => str.split(' '));
      const date = nestedArr[0][nestedArr[0].length - 1];
      const cases = Number(nestedArr[1][nestedArr[1].length - 1] || '0');
      const incomplete = label.includes('incomplete');
      if (incomplete && cases !== 0) {
        incompleteDatesSet.add(date);
      }

      return { date, cases, incomplete };
    })
    .filter(({ date, cases, incomplete }) => {
      // fitler OUT if incomplete is false and the date is in the set
      if (!incomplete && incompleteDatesSet.has(date)) {
        return false;
      }
      // filter OUT if incomplete is true and the date is not in the set
      if (incomplete && !incompleteDatesSet.has(date)) {
        return false;
      }
      if (incomplete && cases === 0) {
        return false;
      }

      return true;
    })
    .map((tuple, idx, arr) => {
      if (idx < 7) {
        return {
          ...tuple,
          date: new Date(tuple.date),
          sevenDayRollingAvg: 0,
          slope: undefined,
          daysToZero: undefined,
          finishDate: undefined,
        };
      }
      let sum = tuple.cases;
      for (let i = 1; i < 7; i += 1) {
        sum += arr[idx - i].cases;
      }
      const sevenDayRollingAvg = Math.round(sum / 7);
      if (sevenDayRollingAvg > peakCaseCount.cases) {
        peakCaseCount = { cases: sevenDayRollingAvg, date: new Date(tuple.date) };
      }

      return { ...tuple, date: new Date(tuple.date), sevenDayRollingAvg };
    })
    .map((tuple) => {
      let slope: number | undefined;
      if (
        tuple.date.getTime() > peakCaseCount.date.getTime() &&
        tuple.sevenDayRollingAvg < peakCaseCount.cases &&
        tuple.date.getTime() > new Date('05/13/20').getTime()
      ) {
        slope =
          (peakCaseCount.cases - tuple.sevenDayRollingAvg) /
          ((tuple.date.getTime() - peakCaseCount.date.getTime()) / (24 * 60 * 60 * 1000));
        slope = Math.round(slope * 100) / 100;
      }

      let daysToZero: number | undefined;
      if (slope) {
        daysToZero = Math.round(tuple.sevenDayRollingAvg / slope);
      }

      let finishDate: Date | undefined;
      if (daysToZero) {
        finishDate = new Date(tuple.date.getTime() + daysToZero * 24 * 60 * 60 * 1000);
      }

      return { ...tuple, slope, daysToZero, finishDate };
    });

  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile('/Users/spencercorwin/Desktop/wa-covid-data.xlsx');
  const worksheet = workbook.getWorksheet('Sheet1');
  const labelRow = worksheet.getRow(1);
  let index = 2;
  let row = worksheet.getRow(index);
  const firstEmptyCol = labelRow.cellCount === 0 ? 1 : labelRow.cellCount - 2;
  results.forEach(({ date, cases, incomplete, sevenDayRollingAvg, slope, daysToZero, finishDate }) => {
    labelRow.getCell(firstEmptyCol).value = `Date. Collected ${todaysDate}`;
    labelRow.getCell(firstEmptyCol + 1).value = 'Cases';
    labelRow.getCell(firstEmptyCol + 2).value = 'Incomplete?';
    labelRow.getCell(firstEmptyCol + 3).value = '7 Day Rolling Avg';
    labelRow.getCell(firstEmptyCol + 4).value = 'Slope';
    labelRow.getCell(firstEmptyCol + 5).value = 'Days to Zero';
    labelRow.getCell(firstEmptyCol + 6).value = 'Projected Finish Date';
    row.getCell(firstEmptyCol).value = date;
    row.getCell(firstEmptyCol + 1).value = cases;
    row.getCell(firstEmptyCol + 2).value = incomplete ? 'True' : 'False';
    row.getCell(firstEmptyCol + 3).value = sevenDayRollingAvg;
    if (slope !== undefined && !Number.isNaN(slope)) {
      row.getCell(firstEmptyCol + 4).value = slope;
    }
    if (daysToZero !== undefined) {
      row.getCell(firstEmptyCol + 5).value = daysToZero;
    }
    if (finishDate !== undefined) {
      row.getCell(firstEmptyCol + 6).value = finishDate;
    }
    index += 1;
    row = worksheet.getRow(index);
  });
  row.commit();
  await workbook.xlsx.writeFile('/Users/spencercorwin/Desktop/wa-covid-data.xlsx');
};

scrape()
  .then(() => {
    // eslint-disable-next-line no-process-exit
    process.exit(0);
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.log(e);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
