import axios from 'axios';

const url = 'https://widgets.mindbodyonline.com/widgets/schedules/168830/load_markup';

export interface ResultData {
  readonly date: Date;
  readonly dateRaw: string;
  readonly isFull: boolean;
  readonly open?: number;
  readonly available?: number;
}

export const scrape = async (): Promise<ResultData[]> => {
  const res = await axios.get(url);

  if (res.status !== 200) {
    throw new Error('Error fetching data');
  }

  const strings = res.data.class_sessions
    .split('scheduleData')
    .filter((str: string) => str.includes('hc_availability'));
  if (strings.length === 0) {
    throw new Error('Split on scheduleData did not work');
  }
  const initialString = strings[0];
  const dataUrls = initialString
    .split('data-url')
    .slice(1)
    .filter((str: string) => str.includes('add_booking'));

  if (dataUrls.length === 0) {
    throw new Error('No data-urls found');
  }

  // eslint-disable-next-line require-unicode-regexp
  const dateRegex = /.*info%5D=(.*?(?:pm|am)).*/;
  // eslint-disable-next-line require-unicode-regexp
  const openRegex = /.*open-(\d+)-(\d+).*/;

  const results: ResultData[] = dataUrls
    .map((dataStr: string) => {
      const dateMatch = dataStr.match(dateRegex);
      if (dateMatch === null || dateMatch.length === 0) {
        console.log(`Date regex did not match anything. Raw dataStr: ${dataStr}`);

        return;
      }
      const [_, rawDate] = dateMatch;
      const decodedDate = decodeURIComponent(rawDate);
      const cleanedDate = decodedDate.replace(/\+/gu, ' ');
      const date = new Date(cleanedDate);

      const openMatch = dataStr.match(openRegex);
      const hasWaitlist = dataStr.includes('wailist') || dataStr.includes('Waitlist');
      if (hasWaitlist || openMatch === null || openMatch.length === 0) {
        return { date, dateRaw: cleanedDate, isFull: true };
      }

      const [__, openIn, availableIn] = openMatch;

      if (date.toString() === 'Invalid Date') {
        console.log(`Date string was parsed as invalid date. Raw dataStr: ${dataStr}`);

        return;
      }
      const open = Number(openIn);
      const available = Number(availableIn);
      if (Number.isNaN(open) || Number.isNaN(available)) {
        console.log(`Open or available was parsed as NaN. Raw dataStr: ${dataStr}`);

        return;
      }

      return { date, dateRaw: cleanedDate, isFull: false, open, available };
    })
    .filter((item: ResultData) => item != null);

  if (results.length === 0) {
    throw new Error('No results found. Something went wrong. Check logs');
  }

  const sortedResults = results.sort((a, b) => {
    if (a.date === undefined) {
      console.log(a);
    }
    if (b.date === undefined) {
      console.log(b);
    }
    return a.date.getTime() - b.date.getTime();
  });

  return sortedResults;
};
