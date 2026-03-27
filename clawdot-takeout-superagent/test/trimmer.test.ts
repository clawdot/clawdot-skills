import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  trimSearchResults,
  buildMenuOverview,
  buildCategoryDetail,
  buildItemDetail,
  resolveCategory,
  buildIngredientsSummary,
} from "../src/trimmer.js";
import type { SearchShopsResponse, ShopDetailResponse } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const searchFixture: SearchShopsResponse = JSON.parse(
  readFileSync(join(__dirname, "fixtures/shop-search.json"), "utf-8"),
);
const detailFixture: ShopDetailResponse = JSON.parse(
  readFileSync(join(__dirname, "fixtures/shop-detail.json"), "utf-8"),
);

describe("trimSearchResults", () => {
  it("strips image, brand_name, is_ad and keeps core fields", () => {
    const result = trimSearchResults(searchFixture);
    assert.equal(result.count, 2);
    assert.equal(result.shops.length, 2);
    const shop = result.shops[0];
    assert.equal(shop.id, "E15074238835124929109");
    assert.equal(shop.name, "瑞幸咖啡(新街口店)");
    assert.equal(shop.rating, "4.8");
    assert.equal(shop.delivery_fee, 3.0);
    assert.ok(!("image" in shop));
    assert.ok(!("brand_name" in shop));
    assert.ok(!("is_ad" in shop));
  });

  it("extracts top 2 item names as highlights", () => {
    const result = trimSearchResults(searchFixture);
    assert.deepEqual(result.shops[0].highlights, ["生椰拿铁", "美式咖啡"]);
    assert.deepEqual(result.shops[1].highlights, ["拿铁"]);
  });
});

describe("buildMenuOverview", () => {
  it("returns categories with top 3 items", () => {
    const overview = buildMenuOverview(detailFixture);
    assert.equal(overview.shop_name, "瑞幸咖啡(新街口店)");
    assert.equal(overview.business_hours, "周一至周日 07:00-22:00");
    assert.equal(overview.categories.length, 2);
    const cat0 = overview.categories[0];
    assert.equal(cat0.name, "经典咖啡");
    assert.equal(cat0.index, 0);
    assert.equal(cat0.item_count, 2);
    assert.equal(cat0.top_items.length, 2);
    assert.equal(cat0.top_items[0].name, "生椰拿铁");
    assert.equal(cat0.top_items[0].price, 29.0);
    assert.equal(cat0.top_items[0].sold, "月售 2000+");
  });
});

describe("resolveCategory", () => {
  const categories = detailFixture.menu;

  it("matches by exact name", () => {
    const result = resolveCategory(categories, "经典咖啡");
    assert.equal(result?.category, "经典咖啡");
  });

  it("matches by index string", () => {
    const result = resolveCategory(categories, "1");
    assert.equal(result?.category, "轻食");
  });

  it("matches by fuzzy contains", () => {
    const result = resolveCategory(categories, "咖啡");
    assert.equal(result?.category, "经典咖啡");
  });

  it("returns null for no match", () => {
    assert.equal(resolveCategory(categories, "火锅"), null);
  });
});

describe("buildCategoryDetail", () => {
  it("returns items with has_specs/has_ingredients flags", () => {
    const cat = detailFixture.menu[0];
    const result = buildCategoryDetail(cat);
    assert.equal(result.category, "经典咖啡");
    assert.equal(result.items.length, 2);
    const item0 = result.items[0];
    assert.equal(item0.item_id, "670685166551");
    assert.equal(item0.has_specs, true);
    assert.equal(item0.has_ingredients, true);
    assert.equal(item0.sold, "月售 2000+");
    const item1 = result.items[1];
    assert.equal(item1.has_ingredients, false);
  });
});

describe("buildItemDetail", () => {
  it("returns specs, attrs, ingredients summary, default_ingredients", () => {
    const item = detailFixture.menu[0].items[0];
    const detail = buildItemDetail(item);
    assert.equal(detail.item_id, "670685166551");
    assert.equal(detail.sku_id, "5014584502270");
    assert.deepEqual(detail.specs, [{ name: "规格", options: ["大杯", "中杯"] }]);
    assert.equal(detail.ingredients_summary, "浓缩(单份浓缩/双份浓缩) | 椰浆(标准椰浆/加浓椰浆)");
    assert.equal(detail.default_ingredients.length, 2);
  });
});

describe("buildIngredientsSummary", () => {
  it("formats groups with option names", () => {
    const groups = detailFixture.menu[0].items[0].ingredients!;
    assert.equal(
      buildIngredientsSummary(groups),
      "浓缩(单份浓缩/双份浓缩) | 椰浆(标准椰浆/加浓椰浆)",
    );
  });

  it("returns empty string for no ingredients", () => {
    assert.equal(buildIngredientsSummary([]), "");
    assert.equal(buildIngredientsSummary(undefined), "");
  });
});
