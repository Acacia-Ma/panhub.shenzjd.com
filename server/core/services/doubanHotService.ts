import { load } from "cheerio";
import { ofetch } from "ofetch";
import { DOUBAN_HOT_SOURCES } from "../../../config/doubanHot";
import { MemoryCache } from "../cache/memoryCache";

export interface DoubanHotItem {
  id?: number;
  title: string;
  url?: string;
  cover?: string;
  desc?: string;
  hot?: number;
}

export interface DoubanHotCategory {
  id: string;
  label: string;
  title: string;
  type: string;
  items: DoubanHotItem[];
}

export interface DoubanHotResult {
  categories: Record<string, DoubanHotCategory>;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时（豆瓣新片榜更新较慢）
const cache = new MemoryCache<DoubanHotResult>({ maxSize: 10 });
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";

function getNumbers(text: string | undefined): number {
  if (!text) return 0;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function buildCacheKey(categories: string[]): string {
  return `douban-hot:${[...categories].sort().join(",")}`;
}

/** 豆瓣 CDN 实际返回 webp，页面里的 .jpg 需替换为 .webp */
function fixDoubanCoverUrl(url: string): string {
  if (!url || !url.includes("doubanio.com")) return url;
  return url.replace(/\.jpg$/i, ".webp");
}

export function extractSearchTerm(title: string): string {
  return title.replace(/^【[\d.]+】/, "").trim() || title;
}

async function scrapeDoubanMovie(): Promise<DoubanHotItem[]> {
  const url = "https://movie.douban.com/chart/";
  const html = await ofetch<string>(url, {
    headers: { "user-agent": UA },
    timeout: 10000,
  });
  const $ = load(html);
  const items: DoubanHotItem[] = [];

  $(".article tr.item").each((_, el) => {
    const dom = $(el);
    const href = dom.find("a").attr("href") || "";
    const id = getNumbers(href);
    const rawTitle = dom.find("a").attr("title") || "";
    const scoreDom = dom.find(".rating_nums");
    const score = scoreDom.length ? scoreDom.text() : "0.0";
    const title = rawTitle ? `【${score}】${rawTitle}` : "";
    if (!title) return;

    const img = dom.find("img");
    const cover =
      img.attr("data-src") ||
      img.attr("data-original") ||
      img.attr("src") ||
      undefined;

    const coverUrl = cover
      ? fixDoubanCoverUrl(cover.startsWith("//") ? "https:" + cover : cover)
      : undefined;
    items.push({
      id: id || undefined,
      title,
      cover: coverUrl,
      desc: dom.find("p.pl").text().trim(),
      hot: getNumbers(dom.find("span.pl").text()),
      url: href || `https://movie.douban.com/subject/${id}/`,
    });
  });

  return items;
}

async function scrapeDoubanTop250(): Promise<DoubanHotItem[]> {
  const url = "https://movie.douban.com/top250";
  const html = await ofetch<string>(url, {
    headers: { "user-agent": UA },
    timeout: 10000,
  });
  const $ = load(html);
  const items: DoubanHotItem[] = [];

  $(".article ol.grid_view li").each((_, el) => {
    const dom = $(el);
    const href = dom.find(".pic a").attr("href") || "";
    const id = getNumbers(href);
    const rawTitle = dom.find(".info .title").first().text() || "";
    const scoreDom = dom.find(".info .rating_num");
    const score = scoreDom.length ? scoreDom.text() : "0.0";
    const title = rawTitle ? `【${score}】${rawTitle}` : "";
    if (!title) return;

    const img = dom.find("img");
    const cover =
      img.attr("data-src") ||
      img.attr("data-original") ||
      img.attr("src") ||
      undefined;

    const coverUrl = cover
      ? fixDoubanCoverUrl(cover.startsWith("//") ? "https:" + cover : cover)
      : undefined;

    const quote = dom.find(".info .inq").text().trim();
    const info = dom.find(".info .bd p").first().text().trim();

    items.push({
      id: id || undefined,
      title,
      cover: coverUrl,
      desc: quote || info.split("/")[0].trim(),
      hot: getNumbers(dom.find(".info .star span:last").text()),
      url: href || `https://movie.douban.com/subject/${id}/`,
    });
  });

  return items;
}

async function scrapeDoubanWeekly(): Promise<DoubanHotItem[]> {
  const url = "https://movie.douban.com/chart/";
  const html = await ofetch<string>(url, {
    headers: { "user-agent": UA },
    timeout: 10000,
  });
  const $ = load(html);
  const items: DoubanHotItem[] = [];

  // 找到包含"一周口碑榜"的 h2，然后获取其父元素中的列表
  $("h2").each((_, h2) => {
    const h2Text = $(h2).text();
    if (h2Text.includes("一周口碑榜")) {
      // 获取 h2 后面的列表
      const list = $(h2).next("ul");
      if (list.length) {
        list.find("li").each((_, el) => {
          const dom = $(el);
          const rank = dom.find(".no").text().trim();
          const href = dom.find(".name a").attr("href") || "";
          const id = getNumbers(href);
          const rawTitle = dom.find(".name a").text().trim();
          const title = rawTitle ? `#${rank} ${rawTitle}` : "";
          if (!title) return;

          const scoreDom = dom.find(".rating_nums");
          const score = scoreDom.length ? scoreDom.text().trim() : "";
          const desc = score ? `评分 ${score}` : "";

          items.push({
            id: id || undefined,
            title,
            desc,
            url: href || `https://movie.douban.com/subject/${id}/`,
          });
        });
      }
    }
  });

  return items;
}

async function scrapeDoubanUsBox(): Promise<DoubanHotItem[]> {
  const url = "https://movie.douban.com/chart/";
  const html = await ofetch<string>(url, {
    headers: { "user-agent": UA },
    timeout: 10000,
  });
  const $ = load(html);
  const items: DoubanHotItem[] = [];

  // 找到包含"北美票房榜"的 h2，然后获取其父元素中的列表
  $("h2").each((_, h2) => {
    const h2Text = $(h2).text();
    if (h2Text.includes("北美票房榜")) {
      // 获取 h2 后面的列表
      const list = $(h2).next("ul");
      if (list.length) {
        list.find("li").each((_, el) => {
          const dom = $(el);
          const rank = dom.find(".no").text().trim();
          const href = dom.find(".box_chart a").attr("href") || "";
          const id = getNumbers(href);
          const rawTitle = dom.find(".box_chart a").text().trim();
          const title = rawTitle ? `#${rank} ${rawTitle}` : "";
          if (!title) return;

          const boxOffice = dom.find(".box_office").text().trim();
          const desc = boxOffice ? `票房 ${boxOffice}` : "";

          const img = dom.find("img");
          const cover =
            img.attr("data-src") ||
            img.attr("data-original") ||
            img.attr("src") ||
            undefined;

          const coverUrl = cover
            ? fixDoubanCoverUrl(cover.startsWith("//") ? "https:" + cover : cover)
            : undefined;

          items.push({
            id: id || undefined,
            title,
            cover: coverUrl,
            desc,
            url: href || `https://movie.douban.com/subject/${id}/`,
          });
        });
      }
    }
  });

  return items;
}

const scrapers: Record<string, () => Promise<DoubanHotItem[]>> = {
  "douban-movie": scrapeDoubanMovie,
  "douban-top250": scrapeDoubanTop250,
  "douban-weekly": scrapeDoubanWeekly,
  "douban-us-box": scrapeDoubanUsBox,
};

export async function fetchDoubanHot(
  categories?: string[]
): Promise<DoubanHotResult> {
  const routeIds = categories?.length
    ? categories
    : DOUBAN_HOT_SOURCES.map((s) => s.route);
  const cacheKey = buildCacheKey(routeIds);

  const cached = cache.get(cacheKey);
  if (cached.hit && cached.value) {
    return cached.value;
  }

  const results: DoubanHotResult = { categories: {} };

  await Promise.all(
    routeIds.map(async (route) => {
      const config = DOUBAN_HOT_SOURCES.find((s) => s.route === route);
      if (!config) return;

      const scrape = scrapers[route];
      if (!scrape) {
        results.categories[config.id] = {
          id: config.id,
          label: config.label,
          title: config.label,
          type: "",
          items: [],
        };
        return;
      }

      try {
        const items = await scrape();
        results.categories[config.id] = {
          id: config.id,
          label: config.label,
          title: config.label,
          type: config.type || "",
          items,
        };
      } catch (e) {
        results.categories[config.id] = {
          id: config.id,
          label: config.label,
          title: config.label,
          type: "",
          items: [],
        };
        console.warn(`[DoubanHot] ${route} 抓取失败:`, (e as Error).message);
      }
    })
  );

  cache.set(cacheKey, results, CACHE_TTL_MS);
  return results;
}
