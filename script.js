function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    if (b === 0) return a;
    return gcd(b, a % b);
}

// --- MathML fraction label helper ---
function formatTickAsMathML(chosenDenominator) {
    return function (value) {
        const tolerance = 1e-9;

        if (chosenDenominator === 1) {
            let displayVal = Math.abs(value - Math.round(value)) < tolerance ? Math.round(value) : value;
            return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>${displayVal}</mn></math>`;
        }

        let numForCalc = value * chosenDenominator;
        if (Math.abs(numForCalc - Math.round(numForCalc)) < tolerance * chosenDenominator) {
            numForCalc = Math.round(numForCalc);
        }

        const sign = numForCalc < 0 ? '-' : '';
        const absNumForCalc = Math.abs(numForCalc);
        const denForCalc = chosenDenominator;

        let mathmlString = "";

        if (Math.abs(value) < tolerance || (Math.abs(numForCalc) < tolerance && denForCalc > 0)) {
            return `<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mn>0</mn></math>`;
        }

        const remainderCheck = absNumForCalc % denForCalc;
        if (Math.abs(remainderCheck) < tolerance * denForCalc ||
            (Math.abs(denForCalc - remainderCheck) < tolerance * denForCalc && remainderCheck !== 0)
        ) {
            const wholeVal = Math.round(numForCalc / denForCalc);
            mathmlString = `<mn>${wholeVal}</mn>`;
        } else if (absNumForCalc > denForCalc) {
            const wholePart = Math.trunc(numForCalc / denForCalc);
            let remainderNum = Math.round(absNumForCalc % denForCalc);
            let remainderDen = denForCalc;

            if (remainderNum === 0) {
                mathmlString = `<mn>${wholePart}</mn>`;
            } else {
                if (state.simplifyFractions) {
                    const common = gcd(remainderNum, remainderDen);
                    if (common > 1) {
                        remainderNum /= common;
                        remainderDen /= common;
                    }
                }
                mathmlString = `<mo>${sign}</mo><mn>${Math.abs(wholePart)}</mn><mfrac><mn>${remainderNum}</mn><mn>${remainderDen}</mn></mfrac>`;
            }
        } else {
            let displayNum = Math.round(absNumForCalc);
            let displayDen = denForCalc;

            if (state.simplifyFractions) {
                const common = gcd(displayNum, displayDen);
                if (common > 1) {
                    displayNum /= common;
                    displayDen /= common;
                }
            }
            mathmlString = `<mo>${sign}</mo><mfrac><mn>${displayNum}</mn><mn>${displayDen}</mn></mfrac>`;
        }
        return `<math xmlns=\"http://www.w3.org/1998/Math/MathML\">${mathmlString}</math>`;
    };
}

const margin = { top: 120, right: 60, bottom: 60, left: 30 };
let svgWidth, svgHeight, chartWidth, chartHeight;

const svg = d3.select("#chartContainer").append("svg");
const chartG = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
const rodsG = chartG.append("g").attr("class", "fraction-rods");
const gridG = chartG.append("g").attr("class", "grid-lines");
const axisG = chartG.append("g").attr("class", "axis");
const axisG2 = chartG.append("g").attr("class", "axis axis-decimal");
const eventRect = chartG.append("rect")
    .attr("class", "event-capture-rect");

let xScale = d3.scaleLinear();
let xAxis = d3.axisBottom(xScale);

const state = {
    domain: [-0.01, 1.01],
    selectedDenominator: 'auto',
    simplifyFractions: true,
};

const ALLOWED_DENOMINATORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30, 40, 50, 60, 100];
const MIN_FRACTION_TICKS = 7;
const MAX_FRACTION_TICKS = 10;
const MAX_LABELS = 10;

function findBestDenominator(domain, allowedDenominators, minTicks, maxTicks) {
    if (!domain) return null;
    const [d0, d1] = domain;
    if (d0 >= d1 || Math.abs(d1 - d0) < 1e-9) return null;

    const sortedDenominators = [...allowedDenominators].filter(d => d > 1).sort((a, b) => a - b);

    for (const denom of sortedDenominators) {
        const firstNumerator = Math.ceil(d0 * denom - 1e-9);
        const lastNumerator = Math.floor(d1 * denom + 1e-9);
        const numTicks = lastNumerator - firstNumerator + 1;
        if (numTicks >= minTicks && numTicks <= maxTicks) {
            return denom;
        }
    }

    let fallbackDenom = null;
    let bestFallbackScore = -1;

    for (const denom of sortedDenominators) {
        const firstNumerator = Math.ceil(d0 * denom - 1e-9);
        const lastNumerator = Math.floor(d1 * denom + 1e-9);
        const numTicks = lastNumerator - firstNumerator + 1;

        if (numTicks >= 2 && numTicks <= maxTicks * 1.8) {
            const score = numTicks - Math.abs(numTicks - minTicks) * 0.5 - denom * 0.01;
            if (score > bestFallbackScore) {
                bestFallbackScore = score;
                fallbackDenom = denom;
            }
        }
    }
    if (fallbackDenom) return fallbackDenom;

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
    const firstNumerator = Math.ceil(d0 * denominator - 1e-9);
    const lastNumerator = Math.floor(d1 * denominator + 1e-9);
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

    if (chartWidth <= 0 || chartHeight <= 0) return;

    svg.attr("width", svgWidth).attr("height", svgHeight);
    chartG.attr("transform", `translate(${margin.left},${margin.top})`);

    const domainPadding = 0.03 * (state.domain[1] - state.domain[0]);
    const paddedDomain = [state.domain[0], state.domain[1] + domainPadding];
    xScale.domain(paddedDomain).range([0, chartWidth]);
    axisG.attr("transform", `translate(0,${chartHeight / 2})`);
    axisG2.attr("transform", `translate(0,${chartHeight / 2 - 80})`);

    const axisY = chartHeight / 2;
    const axisY2 = chartHeight / 2 - 80;
    const eventRectY = axisY2;
    const eventRectHeight = axisY - axisY2;
    eventRect
        .attr("x", 0)
        .attr("y", eventRectY)
        .attr("width", chartWidth)
        .attr("height", eventRectHeight);

    gridG.selectAll("*").remove();
    rodsG.selectAll("*").remove();
    axisG.selectAll("g.tick").remove();
    axisG2.selectAll("g.tick").remove();

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

    let numTicks2 = Math.max(2, Math.floor(chartWidth / 70));
    numTicks2 = Math.min(numTicks2, MAX_LABELS);
    let decimalTickValues = xScale.ticks(numTicks2);
    let xAxis2 = d3.axisTop(xScale)
        .tickValues(decimalTickValues)
        .tickFormat(d3.format("~g"));
    axisG2.call(xAxis2);
    axisG2.selectAll("g.tick text")
        .attr("class", "mathml-like-label")
        .attr("dy", "-0.3em");
    axisG2.selectAll("g.tick line").attr("y2", -6);
    axisG2.select("path.domain").style("opacity", 1);

    if (bestDenom && bestDenom > 1) {
        const fractionTicks = generateFractionTickValues(state.domain, bestDenom);
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
        let numTicks = Math.max(2, Math.floor(chartWidth / 70));
        numTicks = Math.min(numTicks, MAX_LABELS);
        const domainMin = Math.ceil(state.domain[0]);
        const domainMax = Math.floor(state.domain[1]);
        currentTickValues = [];
        for (let i = domainMin; i <= domainMax; i++) {
            currentTickValues.push(i);
        }
        if (currentTickValues.length < 2) {
            currentTickValues = xScale.ticks(numTicks).filter(v => Math.abs(v - Math.round(v)) < 1e-9);
        }
        tickDenominator = 1;
    }

    xAxis.tickValues(currentTickValues).tickFormat(() => "");
    axisG.call(xAxis);
    axisG.selectAll("g.tick line").attr("y2", 6);

    const foreignObjectWidth = 70;
    const foreignObjectHeight = 100;
    const yMathJaxOffset = 0;

    axisG.selectAll("g.tick")
        .each(function (d) {
            d3.select(this).selectAll("foreignObject").remove();
            const fo = d3.select(this)
                .append("svg:foreignObject")
                .attr("width", foreignObjectWidth)
                .attr("height", foreignObjectHeight)
                .attr("x", -foreignObjectWidth / 2)
                .attr("y", yMathJaxOffset)
                .style("overflow", "visible")
                .style("cursor", "pointer");

            const div = fo.append("xhtml:div")
                .attr("class", "mathml-label-container fraction-label-hover")
                .style("overflow", "visible")
                .style("width", foreignObjectWidth + "px")
                .style("height", foreignObjectHeight + "px")
                .style("position", "relative")
                .html(formatTickAsMathML(tickDenominator)(d));

            fo.append("xhtml:div")
                .style("position", "absolute")
                .style("top", "0")
                .style("left", "0")
                .style("width", foreignObjectWidth + "px")
                .style("height", foreignObjectHeight + "px")
                .style("cursor", "pointer")
                .style("background", "rgba(0,0,0,0)")
                .on("mouseenter", function (event) {
                    d3.selectAll('.decimal-popup').remove();
                    div.classed("fraction-label-hover-active", true)
                        .style("color", "#1976d2");
                    div.select("svg").style("color", "#1976d2");
                    const parentTick = d3.select(fo.node().parentNode);
                    const tickX = +parentTick.attr("transform").match(/\(([-\d.]+),/)[1];
                    const yOffsetForPopupAboveTopAxis = 50;
                    const yPopupRelativeToAxisG = -80 - yOffsetForPopupAboveTopAxis;
                    const yGridLineHighlightStartAbs = (chartHeight / 2) + yPopupRelativeToAxisG;

                    d3.select(fo.node().parentNode.parentNode)
                        .append("text")
                        .attr("class", "decimal-popup mathml-like-label")
                        .attr("x", tickX)
                        .attr("y", yPopupRelativeToAxisG)
                        .attr("text-anchor", "middle")
                        .attr("fill", "#1976d2")
                        .style("fill", "#1976d2")
                        .style("font-weight", "bold")
                        .text(d3.format("~g")(d));

                    const hoveredValue = d;
                    gridG.selectAll("line.grid-line.highlighted")
                        .classed("highlighted", false)
                        .attr("stroke", "#e0e0e0")
                        .attr("stroke-width", 1)
                        .attr("y1", -chartHeight / 2)
                        .attr("y2", chartHeight / 2);

                    const targetGridLine = gridG.selectAll("line.grid-line")
                        .filter(gridData => Math.abs(gridData - hoveredValue) < 1e-9);

                    if (!targetGridLine.empty()) {
                        targetGridLine
                            .classed("highlighted", true)
                            .attr("stroke-width", 1)
                            .attr("y1", yGridLineHighlightStartAbs + 10)
                            .attr("y2", chartHeight / 2);
                    }
                })
                .on("mouseleave", function (event) {
                    d3.selectAll('.decimal-popup').remove();
                    div.classed("fraction-label-hover-active", false)
                        .style("color", null);
                    div.select("svg").style("color", null);

                    gridG.selectAll("line.grid-line.highlighted")
                        .classed("highlighted", false)
                        .attr("stroke", "#e0e0e0")
                        .attr("stroke-width", 1)
                        .attr("y1", -chartHeight / 2)
                        .attr("y2", chartHeight / 2);
                });
        });

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetClear && MathJax.typesetClear([axisG.node()]);
        MathJax.typesetPromise([axisG.node()]).catch(err => console.error("MathJax typesetting error:", err));
    }
    axisG.select("path.domain").style("opacity", 1);

    if (currentTickValues && currentTickValues.length > 0) {
        gridG.selectAll(".grid-line")
            .data(currentTickValues)
            .enter().append("line")
            .attr("class", "grid-line")
            .attr("x1", d => xScale(d))
            .attr("x2", d => xScale(d))
            .attr("y1", -chartHeight / 2)
            .attr("y2", chartHeight / 2)
            .attr("stroke", "#e0e0e0");
    }

    // --- Render Cuisenaire-like Rods ---
    const rodsData = [];
    if (tickDenominator && tickDenominator > 1) {
        const [domainStart, domainEndPadded] = xScale.domain();
        const firstInteger = Math.floor(domainStart);
        const lastInteger = Math.ceil(domainEndPadded);

        // **FIX HERE**: Define explicit domain for color scale for consistent mapping
        const colorScaleDomain = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const colorScale = d3.scaleOrdinal().domain(colorScaleDomain).range(d3.schemeCategory10);

        for (let i = firstInteger; i < lastInteger; i++) {
            const colorIndex = Math.abs(i) % 10; // Index (0-9) for the color scale
            const baseColor = colorScale(colorIndex); // Ensures persistent color for this integer interval's index
            const rodFillColor = d3.color(baseColor).copy({ opacity: 0.3 }).toString();
            const rodTextColor = d3.color(baseColor).darker(1.5).toString();

            for (let j = 1; j <= tickDenominator; j++) {
                const valStart = i + (j - 1) / tickDenominator;
                const valEnd = i + j / tickDenominator;

                if (valEnd > domainStart && valStart < domainEndPadded) {
                    rodsData.push({
                        id: `rod-${i}-${j}`,
                        xStartValue: valStart,
                        xEndValue: valEnd,
                        label: j,
                        fillColor: rodFillColor,
                        textColor: rodTextColor,
                    });
                }
            }
        }
    }

    if (rodsData.length > 0) {
        const ROD_HEIGHT = 45;
        const ROD_Y = (chartHeight / 2 - 40) - (ROD_HEIGHT / 2);

        const rodGroups = rodsG.selectAll("g.fraction-rod-group")
            .data(rodsData, d => d.id)
            .join("g")
            .attr("class", "fraction-rod-group");

        rodGroups.append("rect")
            .attr("class", "fraction-rod-rect")
            .attr("x", d => xScale(d.xStartValue))
            .attr("y", ROD_Y)
            .attr("width", d => Math.max(0, xScale(d.xEndValue) - xScale(d.xStartValue) - 1)) // -1 for a tiny visual gap, if desired
            .attr("height", ROD_HEIGHT)
            .attr("fill", d => d.fillColor);

        rodGroups.append("text")
            .attr("class", "fraction-rod-text")
            .attr("x", d => xScale(d.xStartValue + (d.xEndValue - d.xStartValue) / 2))
            .attr("y", ROD_Y + ROD_HEIGHT / 2)
            .text(d => {
                const rodPixelWidth = xScale(d.xEndValue) - xScale(d.xStartValue);
                const textLength = d.label.toString().length;
                const minWidthForText = textLength * 12 + 6;
                return rodPixelWidth > minWidthForText ? d.label : "";
            })
            .attr("fill", d => d.textColor);
    }
}


const ZOOM_SENSITIVITY = 0.001;
eventRect.on("wheel", function (event) {
    event.preventDefault();
    const [mouseX] = d3.pointer(event, this);

    if (mouseX < 0 || mouseX > chartWidth) return;

    const pointerVal = xScale.invert(mouseX);
    const [d0, d1] = state.domain;
    const zoomFactor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);

    const newD0 = pointerVal - (pointerVal - d0) * zoomFactor;
    const newD1 = pointerVal + (d1 - pointerVal) * zoomFactor;

    const newSpan = newD1 - newD0;
    if (newSpan < 1e-7 || newSpan > 1e7) return;

    state.domain = [newD0, newD1];
    renderNumberline();
});

document.addEventListener("DOMContentLoaded", () => {
    const denomSelect = document.getElementById("denominatorSelect");
    if (denomSelect) {
        denomSelect.addEventListener("change", function () {
            state.selectedDenominator = this.value;
            renderNumberline();
        });
    }

    const simplifyToggle = document.getElementById("simplifyFractionsToggle");
    if (simplifyToggle) {
        simplifyToggle.checked = state.simplifyFractions;
        simplifyToggle.addEventListener("change", function () {
            state.simplifyFractions = this.checked;
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
            renderNumberline();
            window.addEventListener("resize", renderNumberline);
        });
    } else {
        console.warn("MathJax not available or startup.promise not found. Will try rendering.");
        setTimeout(() => {
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