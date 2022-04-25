import axios from 'axios';

const url = 'https://widgets.mindbodyonline.com/widgets/schedules/168830/load_markup';

interface ResultData {
  readonly date: Date;
  readonly dateRaw: string;
  readonly isFull: boolean;
  readonly open: number;
  readonly available: number;
}

export const scrape = async (): Promise<void> => {
  const res = await axios.get(url);

  const initialString = res.data.class_sessions
    .split('scheduleData')
    .filter((str: string) => str.includes('hc_availability'))[0];
  const dataUrls = initialString
    .split('data-url')
    .slice(1)
    .filter((str: string) => str.includes('add_booking'));
  // const regex = /.*info%5D=(.*?(?:pm|am)).*open-(\d+)-(\d+).*/gmu;

  // eslint-disable-next-line require-unicode-regexp
  const dateRegex = /.*info%5D=(.*?(?:pm|am)).*/;
  // eslint-disable-next-line require-unicode-regexp
  const openRegex = /.*open-(\d+)-(\d+).*/;

  // console.log(dataUrls);

  const results: ResultData[] = dataUrls.map((dataStr: string) => {
    const dateMatch = dataStr.match(dateRegex);
    if (dateMatch === null || dateMatch.length === 0) {
      throw new Error('No date found');
    }
    const [_, rawDate] = dateMatch;
    const openMatch = dataStr.match(openRegex);
    const hasWaitlist = dataStr.includes('wailist') || dataStr.includes('Waitlist');
    if (hasWaitlist || openMatch === null || openMatch.length === 0) {
      return { isFull: true };
    }

    const [__, open, available] = openMatch;
    const decodedDate = decodeURIComponent(rawDate);
    const cleanedDate = decodedDate.replace(/\+/gu, ' ');
    const date = new Date(cleanedDate);

    return {
      date,
      dateRaw: cleanedDate,
      isFull: false,
      open: Number(open),
      available: Number(available),
    };
  });

  const sortedResults = results.sort((a, b) => {
    return a.date.getTime() - b.date.getTime();
  });

  console.log(sortedResults);
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
