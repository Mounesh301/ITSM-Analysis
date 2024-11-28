// Import necessary libraries
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { sankey } from "https://cdn.jsdelivr.net/npm/@gramex/sankey@1";
import { network } from "https://cdn.jsdelivr.net/npm/@gramex/network@2/dist/network.js";
import { kpartite } from "https://cdn.jsdelivr.net/npm/@gramex/network@2/dist/kpartite.js";
import { num0, num2 } from "https://cdn.jsdelivr.net/npm/@gramex/ui@0.3/dist/format.js";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@1";

// Get references to DOM elements
const $elements = {
  uploadIncidents: document.getElementById("incidents"),
  uploadRelations: document.getElementById("relations"),
  filters: document.getElementById("filters"),
  result: document.getElementById("result"),
  showLinks: document.getElementById("show-links"),
  threshold: document.getElementById("threshold"),
  thresholdDisplay: document.getElementById("threshold-display"),
  sankey: document.getElementById("sankey"),
  network: document.getElementById("network"),
  summarize: document.getElementById("summarize"),
  summary: document.getElementById("summary"),
  userQuestion: document.getElementById("user-question"),
  askQuestion: document.getElementById("ask-question"),
  resetFilters: document.getElementById("reset-filters"),
};

// Initialize variables and constants
const data = {};
const graphs = {};
const minDuration = 0;
const maxDuration = 10;
let threshold = parseFloat($elements.threshold.value) || 3;
let colorScale;
const marked = new Marked();
const filters = {};

// Constants for filters and pre-selected categories and sites
const filterKeys = ["Site", "Time frame", "Group", "Category"];
const preSelectedCategories = [];
const preSelectedSites = [];

// Function to read and parse CSV files
async function readCSV(file) {
  const text = await file.text();
  return d3.csvParse(text, d3.autoType);
}

// Event listener for incidents file upload
$elements.uploadIncidents.addEventListener("change", async (e) => {
  data.incidents = await readCSV(e.target.files[0]);
  draw();
});

// Event listener for relations file upload
$elements.uploadRelations.addEventListener("change", async (e) => {
  data.relations = await readCSV(e.target.files[0]);
  draw();
});

// Main function to initialize the application after data is loaded
function draw() {
  if (!data.incidents || !data.relations) return;
  $elements.result.classList.remove("d-none");
  initializeFilters();
  drawFilters();
  update();
}

// Update function to refresh visualizations
function update() {
  updateColorScale();
  drawSankey();
  drawNetwork();
}

function initializeFilters() {
  filterKeys.forEach((key) => {
    const values = [...new Set(
      data.incidents
        .map((d) => d[key])
        .filter((v) => v != null && v !== '')
    )].sort();
    filters[key] = values.map((v) => ({
      value: v,
      selected: key !== "Group", // Select all except 'Group' by default
    }));
  });
}

// Event listener for resetting filters
$elements.resetFilters.addEventListener("click", resetFilters);

// Function to reset filters and update visualizations
function resetFilters() {
  initializeFilters();
  drawFilters();
  update();
}

// Function to draw filter dropdowns
function drawFilters() {
  // Generate HTML for filter dropdowns
  $elements.filters.innerHTML = filterKeys
    .map(
      (key) => `
            <div class="col-md-3">
              <div class="dropdown">
                <button class="btn btn-secondary dropdown-toggle w-100" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                  ${key}
                </button>
                <div class="dropdown-menu w-100" id="dropdown-menu-${key}">
                  <div class="dropdown-search">
                    <input type="text" placeholder="Search ${key}..." class="search-filter">
                  </div>
                  <div class="dropdown-item">
                    <input type="checkbox" class="select-all" id="all-${key}" ${
        key !== "Group" ? "checked" : ""
      }>
                    <label for="all-${key}" class="flex-grow-1">Select All</label>
                  </div>
                  ${
                    key === "Category"
                      ? `
                    <div class="dropdown-item">
                      <input type="checkbox" class="top-10" id="top-10-${key}">
                      <label for="top-10-${key}" class="flex-grow-1">Top 10</label>
                    </div>
                    `
                      : ""
                  }
                  <div id="filter-options-${key}">
                    <!-- Options will be rendered here -->
                  </div>
                </div>
              </div>
            </div>
          `
    )
    .join("");

  // Render options for each filter
  filterKeys.forEach(renderFilterOptions);

  // Add event listeners to filter components
  addFilterEventListeners();

  // Select top groups based on selected categories
  selectTopGroups();
}

// Function to render filter options within each dropdown
function renderFilterOptions(key) {
  const optionsContainer = document.getElementById(`filter-options-${key}`);
  const options = filters[key];

  // Sort options: selected at the top, then unselected
  options.sort((a, b) => b.selected - a.selected || (a.value || '').localeCompare(b.value || ''));

  // Generate HTML for each option
  optionsContainer.innerHTML = options
    .map(
      (option) => `
            <div class="dropdown-item">
              <input type="checkbox" class="filter-checkbox" name="${key}" value="${option.value}" id="${key}-${option.value}" ${
        option.selected ? "checked" : ""
      }>
              <label for="${key}-${option.value}" class="flex-grow-1">${option.value}</label>
            </div>
          `
    )
    .join("");

  // Add event listeners to checkboxes
  optionsContainer.querySelectorAll(".filter-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const value = checkbox.value;
      const option = filters[key].find((opt) => opt.value === value);
      if (option) option.selected = checkbox.checked;
      if (key === "Category") selectTopGroups();
      renderFilterOptions(key);
      update();
    });
  });
}

// Function to add event listeners for filter interactions
function addFilterEventListeners() {
  // Search functionality within filters
  document.querySelectorAll(".search-filter").forEach((input) => {
    input.addEventListener("input", (e) => {
      const searchText = e.target.value.toLowerCase();
      const dropdownMenu = e.target.closest(".dropdown-menu");
      dropdownMenu.querySelectorAll(".dropdown-item").forEach((item) => {
        const label = item.querySelector("label");
        if (label) {
          const text = label.textContent.toLowerCase();
          item.style.display = text.includes(searchText) ? "" : "none";
        }
      });
    });
  });

  // 'Select All' functionality
  document.querySelectorAll(".select-all").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.id.replace("all-", "");
      const checked = e.target.checked;
      filters[key].forEach((option) => (option.selected = checked));
      if (key === "Category") selectTopGroups();
      renderFilterOptions(key);
      update();
    });
  });

  // 'Top 10' categories functionality
  document.querySelectorAll(".top-10").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.id.replace("top-10-", "");
      const checked = e.target.checked;
      filters[key].forEach((option) => {
        option.selected = checked && preSelectedCategories.includes(option.value);
      });
      document.getElementById(`all-${key}`).checked = false; // Uncheck 'Select All'
      selectTopGroups();
      renderFilterOptions(key);
      update();
    });
  });

  // Prevent dropdown from closing on click inside
  document.querySelectorAll(".dropdown-menu").forEach((menu) => {
    menu.addEventListener("click", (e) => e.stopPropagation());
  });
}

// Function to select top groups based on selected categories
function selectTopGroups() {
  const selectedCategories = filters["Category"].filter((opt) => opt.selected).map((opt) => opt.value);

  // Unselect all groups initially
  filters["Group"].forEach((option) => (option.selected = false));

  if (selectedCategories.length === 0) {
    renderFilterOptions("Group");
    return;
  }

  // Calculate top 2 groups for each selected category
  const incidentsByGroupCategory = d3.rollups(
    data.incidents,
    (v) => d3.sum(v, (d) => d.Count),
    (d) => d.Category,
    (d) => d.Group
  );

  const topGroups = new Set();

  for (const [category, groups] of incidentsByGroupCategory) {
    if (selectedCategories.includes(category)) {
      groups
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .forEach(([groupName]) => topGroups.add(groupName));
    }
  }

  // Select only the top groups
  filters["Group"].forEach((option) => {
    option.selected = topGroups.has(option.value);
  });

  // Re-render group options
  renderFilterOptions("Group");
}

// Function to filter incidents based on selected filters
function filteredIncidents() {
  const selectedValues = {};
  filterKeys.forEach((key) => {
    selectedValues[key] = filters[key].filter((opt) => opt.selected).map((opt) => opt.value);
  });

  return data.incidents.filter((row) =>
    filterKeys.every(
      (key) => selectedValues[key].length === 0 || selectedValues[key].includes(row[key])
    )
  );
}

// Function to draw the Sankey diagram
function drawSankey() {
  const incidents = filteredIncidents();

  // Check if incidents are present
  if (incidents.length === 0) {
    $elements.sankey.innerHTML = `<div class="alert alert-info" role="alert">
      No data available for the selected filters.
    </div>`;
    return;
  }

  const graph = sankey($elements.sankey, {
    data: incidents,
    labelWidth: 100,
    categories: ["Time frame", "Site", "Group", "Category"],
    size: (d) => d.Count,
    text: (d) => (d.key.length * 6 < d.width ? d.key : null),
    d3,
  });
  graphs.sankey = graph;

  // Adjust 'Hours' and 'size' for nodes and links
  adjustHoursAndSize(graph.nodeData);
  adjustHoursAndSize(graph.linkData);

  // Add tooltips
  graph.nodes
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.key}: ${num2(d.Hours)} hours`);

  graph.links
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.source.key} - ${d.target.key}: ${num2(d.Hours)} hours`);

  // Style text labels
  graph.texts.attr("fill", "black").attr("font-size", "12px");
  colorSankey();

  // Initialize Bootstrap tooltips
  initializeTooltips();
}

// Function to adjust 'Hours' and 'size' properties for nodes and links
function adjustHoursAndSize(items) {
  items.forEach((d) => {
    const totalAdjustedHours = d3.sum(d.group, (item) => item.Hours * item.Count);
    const totalCount = d3.sum(d.group, (item) => item.Count);
    d.Hours = totalAdjustedHours / totalCount;
    d.size = totalCount;
  });
}

// Function to update color scale based on threshold
function updateColorScale() {
  colorScale = d3
    .scaleLinear()
    .domain([minDuration, 2, threshold, 4, maxDuration])
    .range(["green", "green", "yellow", "red", "red"])
    .clamp(true);
}

// Function to color the Sankey diagram based on 'Hours'
function colorSankey() {
  $elements.thresholdDisplay.textContent = num2(threshold);
  graphs.sankey.nodes.attr("fill", (d) => colorScale(d.Hours));
  graphs.sankey.links.attr("fill", (d) => colorScale(d.Hours));
}

// Event listener to toggle links in Sankey diagram
$elements.showLinks.addEventListener("change", () => {
  graphs.sankey.links.classed("show", $elements.showLinks.checked);
});

// Event listener for threshold slider
$elements.threshold.addEventListener("input", () => {
  threshold = parseFloat($elements.threshold.value);
  updateColorScale();
  colorSankey();
});

// Function to draw the network graph
function drawNetwork() {
  const incidents = filteredIncidents();

  // Check if incidents are present
  if (incidents.length === 0) {
    $elements.network.innerHTML = `<div class="alert alert-info" role="alert">
      No data available for the selected filters.
    </div>`;
    return;
  }

  // Calculate statistics for Categories and Sub Cats
  const categoryStats = d3.rollup(
    incidents,
    (v) => ({
      TotalHours: d3.sum(v, (d) => d.Hours * d.Count),
      Count: d3.sum(v, (d) => d.Count),
    }),
    (d) => d.Category
  );

  const subCatStats = d3.rollup(
    incidents,
    (v) => ({
      TotalHours: d3.sum(v, (d) => d.Hours * d.Count),
      Count: d3.sum(v, (d) => d.Count),
    }),
    (d) => d["Sub Cat"]
  );

  // Prepare nodes and links for the network graph
  const { nodes, links } = kpartite(
    data.relations,
    [
      ["name", "Source"],
      ["name", "Target"],
    ],
    { count: 1 }
  );

  // Assign statistics to nodes
  nodes.forEach((node) => {
    // Check if node is a Category or Sub Cat
    if (categoryStats.has(node.value)) {
      // Category node
      const stats = categoryStats.get(node.value);
      Object.assign(node, {
        TotalHours: stats.TotalHours,
        Count: stats.Count,
        AvgHours: stats.TotalHours / stats.Count,
      });
    } else if (subCatStats.has(node.value)) {
      // Sub Cat node
      const stats = subCatStats.get(node.value);
      Object.assign(node, {
        TotalHours: stats.TotalHours,
        Count: stats.Count,
        AvgHours: stats.TotalHours / stats.Count,
      });
    } else {
      // Node has no corresponding data
      Object.assign(node, {
        TotalHours: 0,
        Count: 0,
        AvgHours: 0,
      });
    }
  });

  // Define forces for the network layout
  const forces = {
    charge: () => d3.forceManyBody().strength(-200),
  };

  const graph = network($elements.network, { nodes, links, forces, d3 });
  graphs.network = graph;

  // Define radius scale based on incident count
  const maxCount = d3.max(nodes, (d) => d.Count) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxCount]).range([5, 30]);

  // Style nodes
  graph.nodes
    .attr("fill", (d) => colorScale(d.AvgHours))
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("r", (d) => rScale(d.Count))
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) =>
      categoryStats.has(d.value)
        ? `${d.value} (Category): ${num2(d.AvgHours)} hours, ${num0(d.Count)} incidents`
        : subCatStats.has(d.value)
        ? `${d.value} (Subcategory): ${num2(d.AvgHours)} hours, ${num0(d.Count)} incidents`
        : `${d.value}: No data`
    );

  // Style links
  graph.links
    .attr("marker-end", "url(#triangle)")
    .attr("stroke", "rgba(var(--bs-body-color-rgb), 0.2)");

  // Initialize Bootstrap tooltips
  initializeTooltips();
}

// Event listeners for buttons
$elements.summarize.addEventListener("click", summarize);
$elements.askQuestion.addEventListener("click", answerQuestion);

// Function to summarize data and display analysis
async function summarize() {
  const selectedCategories = filters["Category"].filter((opt) => opt.selected).map((opt) => opt.value);

  if (selectedCategories.length === 0) {
    $elements.summary.innerHTML = `<div class="alert alert-warning" role="alert">
      No categories selected for summarization.
    </div>`;
    return;
  }

  const incidents = filteredIncidents();
  const categoryData = {};

  // Prepare data for each selected category
  for (const category of selectedCategories) {
    const categoryIncidents = incidents.filter((d) => d.Category === category);
    if (categoryIncidents.length === 0) continue;

    // Calculate statistics
    const timeFrameStats = computeStats(categoryIncidents, "Time frame");
    const siteStats = computeStats(categoryIncidents, "Site");
    const groupStats = computeStats(categoryIncidents, "Group");

    // Identify related categories from network data
    const relatedCategories = data.relations
      .filter((rel) => rel.Source === category || rel.Target === category)
      .map((rel) => (rel.Source === category ? rel.Target : rel.Source));

    categoryData[category] = {
      timeFrameStats,
      siteStats,
      groupStats,
      relatedCategories,
    };
  }

  // Compute overall statistics
  const overallCategoryStats = computeStats(incidents, "Category");
  const overallGroupStats = computeStats(incidents, "Group");
  const overallSiteStats = computeStats(incidents, "Site");
  const overallTimeFrameStats = computeStats(incidents, "Time frame");

  // Include Network Data in the Message
  const networkSummary = prepareNetworkSummary(selectedCategories);

  // Define the system message for the AI assistant
  const system = `As an expert analyst in financial application's incident management, provide a structured and concise summary for the selected categories, focusing on:

1. **Overall Summary:**
   - Identify overall problematic categories, along with groups, sites, and time frames (only top 2 or 3).
   - Highlight categories, groups, sites, and time frames which are significantly beyond the threshold duration (only top 2 or 3).

2. **Analysis:**
   - Narrate a story flow linking categories, groups, sites, and time frames in 4 key points under the subheading 'Analysis'.

3. **Recommendations:**
   - Highlight connections with other categories or subcategories that might have impacted the problematic categories.
   - Provide specific recommendations based on the current data provided.

Include both incident data and network data in your analysis.

Present the information concisely using bullet points under each section. Ensure that the summary is directly based on the data provided and is actionable.`;

  // Prepare the message with aggregated data
  let message = `Selected Categories:\n${selectedCategories.join(", ")}\n\nOverall Summary:\n`;

  // Append top problematic categories, groups, sites, and time frames
  message += formatTopStats("Problematic categories", overallCategoryStats, "Category");
  message += formatTopStats("Problematic groups", overallGroupStats, "Group");
  message += formatTopStats("Problematic sites", overallSiteStats, "Site");
  message += formatTopStats("Problematic time frames", overallTimeFrameStats, "Time frame");

  // Append network data summary
  message += `\nNetwork Data Summary:\n${networkSummary}\n`;

  // Append per-category summaries
  for (const category of selectedCategories) {
    const data = categoryData[category];
    if (!data) continue;

    message += `\nCategory: ${category}\n`;
    message += formatCategoryStats(data);
  }

  // Display a loading spinner
  $elements.summary.innerHTML = `<div class="spinner-border" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>`;

  // Fetch and display the summary from the AI assistant
  try {
    let fullContent = "";
    let lastContent = "";
    for await (const { content } of asyncLLM(
      "https://llmfoundry.straive.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
        }),
      }
    )) {
      if (content && content !== lastContent) {
        lastContent = content;
        fullContent = content;
        $elements.summary.innerHTML = marked.parse(fullContent);
      }
    }
  } catch (error) {
    console.error("Error in summarize function:", error);
    $elements.summary.innerHTML = `<div class="alert alert-danger" role="alert">
      An error occurred while generating the summary: ${error.message}
    </div>`;
  }
}

// Function to answer user's question based on the data
async function answerQuestion() {
  const userQuestion = $elements.userQuestion.value.trim();
  if (!userQuestion) {
    $elements.summary.innerHTML = `<div class="alert alert-warning" role="alert">
      Please enter a question to ask.
    </div>`;
    return;
  }

  const incidents = filteredIncidents();

  // Get selected categories
  const selectedCategories = filters["Category"].filter((opt) => opt.selected).map((opt) => opt.value);

  if (selectedCategories.length === 0) {
    $elements.summary.innerHTML = `<div class="alert alert-warning" role="alert">
      No categories selected.
    </div>`;
    return;
  }

  // Prepare categoryData as in summarize()
  const categoryData = {};

  // Prepare data for each selected category
  for (const category of selectedCategories) {
    const categoryIncidents = incidents.filter((d) => d.Category === category);
    if (categoryIncidents.length === 0) continue;

    // Calculate statistics
    const timeFrameStats = computeStats(categoryIncidents, "Time frame");
    const siteStats = computeStats(categoryIncidents, "Site");
    const groupStats = computeStats(categoryIncidents, "Group");

    // Identify related categories from network data
    const relatedCategories = data.relations
      .filter((rel) => rel.Source === category || rel.Target === category)
      .map((rel) => (rel.Source === category ? rel.Target : rel.Source));

    categoryData[category] = {
      timeFrameStats,
      siteStats,
      groupStats,
      relatedCategories,
    };
  }

  // Include Network Data in the Message
  const networkSummary = prepareNetworkSummary(selectedCategories);

  // Define the system message for the AI assistant
  const system = `As an expert analyst in financial application's incident management,
answer the user's question based on the data provided.
Provide examples from both the incident data and network data to support your answer.
Present the information concisely and ensure that the answer is directly based on the data provided and is actionable.`;

  // Prepare the message with user's question and data summary
  let message = `User Question:\n${userQuestion}\n\nData Summary:\n`;

  // Include overall statistics
  const overallStats = computeStats(incidents, "Category");
  overallStats.forEach((stat) => {
    message += `- Category ${stat.Category}: ${num0(stat.Count)} incidents, Avg Duration: ${num2(
      stat.AvgHours
    )} hours\n`;
  });

  // Append per-category summaries
  for (const category of selectedCategories) {
    const data = categoryData[category];
    if (!data) continue;

    message += `\nCategory: ${category}\n`;
    message += formatCategoryStats(data);
  }

  // Include network data summary
  message += `\nNetwork Data Summary:\n${networkSummary}\n`;

  // Display a loading spinner
  $elements.summary.innerHTML = `<div class="spinner-border" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>`;

  // Fetch and display the answer from the AI assistant
  try {
    let fullContent = "";
    let lastContent = "";
    for await (const { content } of asyncLLM(
      "https://llmfoundry.straive.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
        }),
      }
    )) {
      if (content && content !== lastContent) {
        lastContent = content;
        fullContent = content;
        $elements.summary.innerHTML = marked.parse(fullContent);
      }
    }
  } catch (error) {
    console.error("Error in answerQuestion function:", error);
    $elements.summary.innerHTML = `<div class="alert alert-danger" role="alert">
      An error occurred while answering the question: ${error.message}
    </div>`;
  }
}

// Helper function to compute statistics
function computeStats(dataArray, groupByKey) {
  return d3
    .rollups(
      dataArray,
      (v) => ({
        Count: d3.sum(v, (d) => d.Count),
        Hours: d3.sum(v, (d) => d.Hours * d.Count),
      }),
      (d) => d[groupByKey]
    )
    .map(([key, stats]) => ({
      [groupByKey]: key,
      Count: stats.Count,
      AvgHours: stats.Hours / stats.Count,
    }));
}

// Helper function to format top statistics for the message
function formatTopStats(title, statsArray, keyName) {
  const topStats = statsArray.sort((a, b) => b.Count - a.Count).slice(0, 5);
  if (topStats.length === 0) return "";
  let result = `- ${title}:\n`;
  result += topStats
    .map(
      (item) =>
        `  ${item[keyName]}: ${num0(item.Count)} incidents (Avg ${num2(item.AvgHours)} hrs)`
    )
    .join("\n");
  return result + "\n\n";
}

// Helper function to format per-category statistics
function formatCategoryStats(data) {
  let result = "";

  // Problematic times
  const topTimeFrames = data.timeFrameStats.sort((a, b) => b.Count - a.Count).slice(0, 2);
  if (topTimeFrames.length > 0) {
    result += `- Problematic time frames:\n`;
    result += topTimeFrames
      .map(
        (timeFrame) =>
          `  ${timeFrame["Time frame"]}: ${num0(timeFrame.Count)} incidents (Avg ${num2(
            timeFrame.AvgHours
          )} hrs)`
      )
      .join("\n");
    result += "\n";
  }

  // Problematic sites
  const topSites = data.siteStats.sort((a, b) => b.Count - a.Count).slice(0, 2);
  if (topSites.length > 0) {
    result += `- Problematic sites:\n`;
    result += topSites
      .map(
        (site) =>
          `  ${site.Site}: ${num0(site.Count)} incidents (Avg ${num2(site.AvgHours)} hrs)`
      )
      .join("\n");
    result += "\n";
  }

  // Problematic groups
  const topGroups = data.groupStats.sort((a, b) => b.Count - a.Count).slice(0, 2);
  if (topGroups.length > 0) {
    result += `- Problematic groups:\n`;
    result += topGroups
      .map(
        (group) =>
          `  ${group.Group}: ${num0(group.Count)} incidents (Avg ${num2(group.AvgHours)} hrs)`
      )
      .join("\n");
    result += "\n";
  }

  // Impacting connections
  result += `- Impacting connections:\n  ${data.relatedCategories.join(", ") || "None"}\n`;

  return result;
}

// Helper function to prepare network data summary
function prepareNetworkSummary(selectedCategories) {
  // Filter network relations based on selected categories
  const relevantRelations = data.relations.filter(
    (rel) => selectedCategories.includes(rel.Source) || selectedCategories.includes(rel.Target)
  );

  // Count the number of connections for each category and subcategory
  const connectionCounts = {};
  relevantRelations.forEach((rel) => {
    const source = rel.Source;
    const target = rel.Target;

    if (!connectionCounts[source]) connectionCounts[source] = new Set();
    if (!connectionCounts[target]) connectionCounts[target] = new Set();

    connectionCounts[source].add(target);
    connectionCounts[target].add(source);
  });

  // Prepare summary lines
  let summary = "";
  for (const category of selectedCategories) {
    const connections = connectionCounts[category]
      ? Array.from(connectionCounts[category])
      : [];
    summary += `- ${category} connections: ${connections.join(", ") || "None"}\n`;
  }

  // Additionally, summarize connections of Sub Cats
  const relatedSubCats = relevantRelations
    .filter((rel) => selectedCategories.includes(rel.Source))
    .map((rel) => rel.Target);

  const uniqueSubCats = Array.from(new Set(relatedSubCats));

  if (uniqueSubCats.length > 0) {
    summary += `\nRelated Subcategories:\n`;
    uniqueSubCats.forEach((subCat) => {
      summary += `- ${subCat}\n`;
    });
  }

  return summary;
}

// Function to initialize Bootstrap tooltips
function initializeTooltips() {
  // Dispose existing tooltips to prevent duplicates
  const tooltipInstances = bootstrap.Tooltip.getInstance(document.body);
  if (tooltipInstances) {
    tooltipInstances.dispose();
  }

  // Initialize new tooltips
  const tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]')
  );
  tooltipTriggerList.map(
    (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
  );
}
