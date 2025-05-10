// --- MathML fraction label helper ---
function formatTickAsMathML(chosenDenominator) {
    return function (value) {
        const tolerance = 1e-9;
        // Special case: denominator 1, just show as integer or decimal
        if (chosenDenominator === 1) {
            // If value is very close to an integer, round it
            let displayVal = Math.abs(value - Math.round(value)) < tolerance ? Math.round(value) : value;
            return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>${displayVal}</mn></math>`;
        }

        let num = value * chosenDenominator;
        if (Math.abs(num - Math.round(num)) < tolerance * chosenDenominator) { // Scale tolerance with denominator
            num = Math.round(num);
        }

        const absNum = Math.abs(num);
        const den = chosenDenominator;
        const sign = num < 0 ? '-' : '';

        let mathmlString = "";

        if (Math.abs(value) < tolerance || (Math.abs(num) < tolerance && chosenDenominator > 0)) {
            return `<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mn>0</mn></math>`;
        }

        const remainderCheck = absNum % den;
        if (Math.abs(remainderCheck) < tolerance * den || Math.abs(den - remainderCheck) < tolerance * den && remainderCheck !== 0) {
            const wholeVal = Math.round(num / den);
            mathmlString = `<mn>${wholeVal}</mn>`;
        } else if (absNum > den) {
            const wholePart = Math.trunc(num / den);
            const remainderNum = Math.round(absNum % den);
            if (remainderNum === 0) { // Should be caught by above check ideally
                mathmlString = `<mn>${wholePart}</mn>`;
            } else {
                if (wholePart === 0 && sign) { // e.g. -0.5 becomes -1/2 rather than 0 -1/2
                    mathmlString = `<mo>${sign}</mo><mfrac><mn>${remainderNum}</mn><mn>${den}</mn></mfrac>`;
                } else if (wholePart === 0 && !sign) { // e.g. 0.5 becomes 1/2
                    mathmlString = `<mfrac><mn>${remainderNum}</mn><mn>${den}</mn></mfrac>`;
                }
                else {
                    mathmlString = `<mo>${sign}</mo><mn>${Math.abs(wholePart)}</mn><mfrac><mn>${remainderNum}</mn><mn>${den}</mn></mfrac>`;
                }
            }
        } else {
            mathmlString = `<mo>${sign}</mo><mfrac><mn>${Math.round(absNum)}</mn><mn>${den}</mn></mfrac>`;
        }
        return `<math xmlns=\"http://www.w3.org/1998/Math/MathML\">${mathmlString}</math>`;
    };
}

const margin = { top: 120, right: 60, bottom: 60, left: 30 }; // Further increased top margin for top axis label visibility
let svgWidth, svgHeight, chartWidth, chartHeight;

const svg = d3.select("#chartContainer").append("svg");
const chartG = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
const gridG = chartG.append("g").attr("class", "grid-lines");
const axisG = chartG.append("g").attr("class", "axis");
const axisG2 = chartG.append("g").attr("class", "axis axis-decimal"); // Second axis for decimals
const eventRect = chartG.append("rect")
    .attr("class", "event-capture-rect");

let xScale = d3.scaleLinear();
let xAxis = d3.axisBottom(xScale);

const state = {
    domain: [-0.01, 1.01], // Initial domain
    selectedDenominator: 'auto', // 'auto' or a number
};

const ALLOWED_DENOMINATORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30, 40, 50, 60, 100];
const MIN_FRACTION_TICKS = 7;
const MAX_FRACTION_TICKS = 10;
const MAX_LABELS = 10; // Maximum number of labels for whole numbers

function findBestDenominator(domain, allowedDenominators, minTicks, maxTicks) {
    if (!domain) return null;
    const [d0, d1] = domain;
    if (d0 >= d1 || Math.abs(d1 - d0) < 1e-9) return null;

    // Filter out denominator 1 if present (shouldn't be, but extra safety)
    const sortedDenominators = [...allowedDenominators].filter(d => d > 1).sort((a, b) => a - b);

    for (const denom of sortedDenominators) {
        const firstNumerator = Math.ceil(d0 * denom - 1e-9); // Add tolerance for ceiling
        const lastNumerator = Math.floor(d1 * denom + 1e-9); // Add tolerance for floor
        const numTicks = lastNumerator - firstNumerator + 1;
        if (numTicks >= minTicks && numTicks <= maxTicks) {
            return denom;
        }
    }

    let fallbackDenom = null;
    let bestFallbackScore = -1; // Higher score is better

    for (const denom of sortedDenominators) {
        const firstNumerator = Math.ceil(d0 * denom - 1e-9);
        const lastNumerator = Math.floor(d1 * denom + 1e-9);
        const numTicks = lastNumerator - firstNumerator + 1;

        if (numTicks >= 2 && numTicks <= maxTicks * 1.8) { // Allow more ticks in fallback, but at least 2
            // Score: prioritize being close to minTicks, then smaller denominator
            const score = numTicks - Math.abs(numTicks - minTicks) * 0.5 - denom * 0.01;
            if (score > bestFallbackScore) {
                bestFallbackScore = score;
                fallbackDenom = denom;
            }
        }
    }
    if (fallbackDenom) return fallbackDenom;

    // Last resort: smallest denominator that shows at least one tick
    for (const denom of sortedDenominators) {
        const firstNumerator = Math.ceil(d0 * denom - 1e-9);
        const lastNumerator = Math.floor(d1 * denom + 1e-9);
        const numTicks = lastNumerator - firstNumerator + 1;
        if (numTicks >= 1) return denom;
    }
    return null;
}

function generateFractionTickValues(domain, denominator) {
    if (!domain || !denominator) return [];
    const [d0, d1] = domain;
    const tickValues = [];
    const firstNumerator = Math.ceil(d0 * denominator - 1e-9); // Tolerance
    const lastNumerator = Math.floor(d1 * denominator + 1e-9); // Tolerance
    for (let num = firstNumerator; num <= lastNumerator; num++) {
        tickValues.push(num / denominator);
    }
    return tickValues;
}


function renderNumberline() {
    const container = d3.select("#chartContainer");
    svgWidth = container.node().clientWidth;
    svgHeight = container.node().clientHeight;

    chartWidth = svgWidth - margin.left - margin.right;
    chartHeight = svgHeight - margin.top - margin.bottom;

    if (chartWidth <= 0 || chartHeight <= 0) return; // Avoid rendering if no space

    svg.attr("width", svgWidth).attr("height", svgHeight);
    chartG.attr("transform", `translate(${margin.left},${margin.top})`);

    // Add a small right padding to the domain to ensure the last tick (e.g. 2) is visible
    const domainPadding = 0.03 * (state.domain[1] - state.domain[0]);
    const paddedDomain = [state.domain[0], state.domain[1] + domainPadding];
    xScale.domain(paddedDomain).range([0, chartWidth]);
    axisG.attr("transform", `translate(0,${chartHeight / 2})`);
    // Position the second axis 80px above the first
    axisG2.attr("transform", `translate(0,${chartHeight / 2 - 80})`);
    eventRect.attr("width", chartWidth).attr("height", chartHeight);

    gridG.selectAll("*").remove();
    axisG.selectAll("g.tick").remove(); // Clear previous D3 ticks
    axisG2.selectAll("g.tick").remove(); // Clear previous D3 ticks for second axis

    // --- Denominator selection logic ---
    let forcedDenominator = null;
    if (state.selectedDenominator && state.selectedDenominator !== 'auto') {
        forcedDenominator = parseInt(state.selectedDenominator, 10);
        if (!ALLOWED_DENOMINATORS.includes(forcedDenominator)) {
            forcedDenominator = null;
        }
    }

    let bestDenom = null;
    if (forcedDenominator) {
        bestDenom = forcedDenominator;
    } else {
        bestDenom = findBestDenominator(state.domain, ALLOWED_DENOMINATORS, MIN_FRACTION_TICKS, MAX_FRACTION_TICKS);
    }

    let currentTickValues;
    let useFractions = false;
    let tickDenominator = null;

    // --- Render the second (top) axis with standard D3 decimal labels ---
    let numTicks2 = Math.max(2, Math.floor(chartWidth / 70));
    numTicks2 = Math.min(numTicks2, MAX_LABELS);
    let decimalTickValues = xScale.ticks(numTicks2);
    // Inverted axis: numbers above, ticks below
    let xAxis2 = d3.axisTop(xScale)
        .tickValues(decimalTickValues)
        .tickFormat(d3.format("~g"));
    axisG2.call(xAxis2);
    // Style the top axis tick labels to look like MathML (serif, bold, large, centered)
    axisG2.selectAll("g.tick text")
        .attr("class", "mathml-like-label")
        .attr("dy", "-0.3em");
    axisG2.selectAll("g.tick line").attr("y2", -6); // Ticks below the axis line
    axisG2.select("path.domain").style("opacity", 1);

    if (bestDenom && bestDenom > 1) {
        const fractionTicks = generateFractionTickValues(state.domain, bestDenom);
        // If forced, always use fractions, even if too many/few ticks
        if (forcedDenominator) {
            useFractions = true;
            currentTickValues = fractionTicks;
            tickDenominator = bestDenom;
        } else if (fractionTicks.length >= MIN_FRACTION_TICKS && fractionTicks.length <= MAX_FRACTION_TICKS) {
            useFractions = true;
            currentTickValues = fractionTicks;
            tickDenominator = bestDenom;
        }
    }
    if (!useFractions) {
        // Use only integer ticks for denominator 1
        let numTicks = Math.max(2, Math.floor(chartWidth / 70));
        numTicks = Math.min(numTicks, MAX_LABELS); // Enforce maximum number of labels
        // Calculate integer ticks within the domain
        const domainMin = Math.ceil(state.domain[0]);
        const domainMax = Math.floor(state.domain[1]);
        currentTickValues = [];
        for (let i = domainMin; i <= domainMax; i++) {
            currentTickValues.push(i);
        }
        // If not enough ticks, fall back to D3 ticks (for very small domains)
        if (currentTickValues.length < 2) {
            currentTickValues = xScale.ticks(numTicks).filter(v => Math.abs(v - Math.round(v)) < 1e-9);
        }
        tickDenominator = 1; // For whole numbers, denominator is 1
    }

    xAxis.tickValues(currentTickValues).tickFormat(() => ""); // Always use MathML, so D3 text is blank
    axisG.call(xAxis);
    axisG.selectAll("g.tick line").attr("y2", 6); // Standard tick line length

    const foreignObjectWidth = 70; // Width for MathML container
    const foreignObjectHeight = 40; // Height for MathML container
    const yMathJaxOffset = 10;    // Offset below the axis line for MathML

    axisG.selectAll("g.tick")
        .append("svg:foreignObject")
        .attr("width", foreignObjectWidth)
        .attr("height", foreignObjectHeight)
        .attr("x", -foreignObjectWidth / 2)
        .attr("y", yMathJaxOffset)
        .style("overflow", "visible")
        .append("xhtml:div")
        .attr("class", "mathml-label-container")
        .style("overflow", "visible")
        .html(d => formatTickAsMathML(tickDenominator)(d));

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetClear && MathJax.typesetClear([axisG.node()]);
        MathJax.typesetPromise([axisG.node()]).catch(err => console.error("MathJax typesetting error:", err));
    }
    axisG.select("path.domain").style("opacity", 1);

    // Draw grid lines
    if (currentTickValues && currentTickValues.length > 0) {
        gridG.selectAll(".grid-line")
            .data(currentTickValues)
            .enter().append("line")
            .attr("class", "grid-line")
            .attr("x1", d => xScale(d))
            .attr("x2", d => xScale(d))
            .attr("y1", -chartHeight / 2) // From top of chartG plotting area
            .attr("y2", chartHeight / 2)  // To bottom of chartG plotting area
            .attr("stroke", "#e0e0e0");
    }
}

const ZOOM_SENSITIVITY = 0.001;
eventRect.on("wheel", function (event) {
    event.preventDefault();
    const [mouseX] = d3.pointer(event, this);

    // Only zoom if pointer is within chart boundaries (safety)
    if (mouseX < 0 || mouseX > chartWidth) return;

    const pointerVal = xScale.invert(mouseX);

    const [d0, d1] = state.domain;
    const zoomFactor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);

    const newD0 = pointerVal - (pointerVal - d0) * zoomFactor;
    const newD1 = pointerVal + (d1 - pointerVal) * zoomFactor;

    const newSpan = newD1 - newD0;
    if (newSpan < 1e-7 || newSpan > 1e7) { // Prevent extreme zoom
        return;
    }

    state.domain = [newD0, newD1];
    renderNumberline();
});

document.addEventListener("DOMContentLoaded", () => {
    // Set up denominator select event listener
    const denomSelect = document.getElementById("denominatorSelect");
    if (denomSelect) {
        denomSelect.addEventListener("change", function () {
            state.selectedDenominator = this.value;
            renderNumberline();
        });
    }

    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise.then(() => {
            console.log('MathJax is fully initialized and ready.');
            renderNumberline();
            window.addEventListener("resize", renderNumberline);
        }).catch(err => {
            console.error("MathJax startup promise failed:", err);
            renderNumberline(); // Attempt to render anyway
            window.addEventListener("resize", renderNumberline);
        });
    } else {
        console.warn("MathJax not available or startup.promise not found during DOMContentLoaded. Will try rendering.");
        // Fallback if MathJax setup is unusual
        setTimeout(() => { // Give MathJax a bit more time if it's loading slowly
            if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
                MathJax.startup.promise.then(() => {
                    console.log('MathJax (delayed) is fully initialized and ready.');
                    renderNumberline();
                    window.addEventListener("resize", renderNumberline);
                });
            } else {
                console.error("MathJax still not ready after delay.");
                renderNumberline();
                window.addEventListener("resize", renderNumberline);
            }
        }, 500);
    }
});