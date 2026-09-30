import { clear, render } from "../../../../shared/ui/tribute/dom";
import { NoResults } from "../../../../shared/ui/components/feedback/no-results";
import { SkeletonImageGrid } from "../../../animations/skeleton/skeleton-image-grid";
import { SkeletonResults } from "../../../animations/skeleton/skeleton-results";
import { isImageSearchType, type SearchResponse } from "../../../../shared/search-types";
import { state } from "../../../state";
import { fetchResultsPage } from "../../net/url";
import { getBase } from "../../net/base-url";
import { clearSlotPanels } from "../../../modules/renderer/render-slots";
import { renderResults } from "../../../modules/renderer/render";
import { teardownInfinite } from "../../../modules/renderer/infinite-scroll/infinite-scroll";
import {
  abortGlancePanels,
  abortSlotFetch,
  fetchGlancePanels,
  fetchSlotPanels,
} from "../search-utils";
import { declaredPages, setResultsMeta } from "../search-helpers";

export async function goToPage(pageNum: number): Promise<void> {
  if (pageNum === state.currentPage) return;
  if (state.currentBangQuery) {
    const { performBangSearch } = await import("./search-actions-perform");
    return performBangSearch(state.currentBangQuery, state.currentType, pageNum);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  teardownInfinite();

  const resultsList = document.getElementById("results-list");
  const pagination = document.getElementById("pagination");
  if (resultsList) {
    if (isImageSearchType(state.currentType)) {
      render(<SkeletonImageGrid />, resultsList);
    } else {
      render(<SkeletonResults />, resultsList);
    }
  }
  if (pagination) clear(pagination);
  try {
    const res = await fetchResultsPage(state.currentType, pageNum);

    const data = (await res.json()) as SearchResponse;
    state.currentResults = data.results;
    state.currentData = data;
    state.currentPage = pageNum;
    state.lastPage = declaredPages(data.totalPages);
    const pageHistoryState = {
      degoog: true,
      query: state.currentQuery,
      type: state.currentType,
      page: pageNum,
    };
    if (state.postMethodEnabled) {
      history.pushState(pageHistoryState, "", `${getBase()}/search`);
    } else {
      const urlParams = new URLSearchParams({ q: state.currentQuery });
      if (state.currentType !== "web") urlParams.set("type", state.currentType);
      if (pageNum > 1) urlParams.set("page", String(pageNum));
      history.pushState(
        pageHistoryState,
        "",
        `${getBase()}/search?${urlParams.toString()}`,
      );
    }
    const metaText = `About ${state.currentResults.length} results - Page ${state.currentPage}`;
    setResultsMeta(metaText);
    abortGlancePanels();
    clearSlotPanels();
    const isImageType = isImageSearchType(state.currentType);
    if (state.currentPage === 1 && !isImageType) {
      void fetchGlancePanels(state.currentQuery, data.results);
    }
    if (!isImageType) {
      abortSlotFetch();
      void fetchSlotPanels(state.currentQuery, state.currentResults);
    }
    renderResults(state.currentResults);
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch (err) {
    console.error("[search] page failed", err);
    if (resultsList)
      render(
        <NoResults>Search failed. Please try again.</NoResults>,
        resultsList,
      );
  }
}
