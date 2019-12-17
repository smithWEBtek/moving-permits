window.addEventListener('DOMContentLoaded', () => {
  Promise.all([
    d3.csv('/assets/data/moving-truck-permits.csv', (d) => ({
      expirationDate: +d.expiration_date.split(' ')[0].split('-')[0],
      zip: d.zip,
    })),
  ]).then((movingPermitdata) => {
    const movingPermitsByDate = Array.from(d3.rollup(movingPermitdata[0],
      (v) => v.length,
      (d) => d.expirationDate,
      (d) => d.zip))
      .map(([date, data]) => [new Date(date, 0, 1), data])
      .sort(([firstDate], [secondDate]) => d3.ascending(firstDate, secondDate)); // sort by date

    const topTwelve = 12;
    const barSize = 48;
    const margin = ({
      top: 16, right: 6, bottom: 6, left: 0,
    });
    // let height = margin.top + barSize * topTwelve + margin.bottom;
    const width = window.innerWidth || document.body.clientWidth;
    const height = window.innerHeight || document.body.clientHeight;
    const duration = 250;

    const svg = d3.select('.moving-permits')
      .append('svg')
      .attr('viewBox', [0, 0, width, height]);

    // discard empty years from datevalues
    const consistentValues = [movingPermitsByDate[7], movingPermitsByDate[8], movingPermitsByDate[9]];

    const zips = new Set(movingPermitdata[0].map((d) => d.zip));
    // debugger;

    function rank(value) {
      const data = Array.from(zips, (zip) => ({ zip, value: value(zip) || 0 }));
      data.sort((a, b) => d3.descending(a.value, b.value));
      for (let i = 0; i < data.length; ++i) data[i].rank = i;
      return data;
    }

    function keyframes(datevalues) {
      const keyframes = [];
      let startingDate; let startingValue; let endingDate; let
        endingValue; // a starting value, b is ending value,
      for ([[startingDate, startingValue], [endingDate, endingValue]] of d3.pairs(datevalues)) {
        for (let i = 0; i < 10; i += 1) {
          // inside here we will take the values in each year and interpolate!
          const t = i / 10; // iteration divided by number of frames
          keyframes.push([
            // year and then month based on iteration.
            new Date(startingDate * (1 - t) + endingDate * t),
            rank((zip) => startingValue.get(zip) * (1 - t) + endingValue.get(zip) * t),
          ]);
        }
      }
      // rank stays the same based on the end value.
      keyframes.push([new Date(endingDate), rank((zip) => endingValue.get(zip))]);
      return keyframes;
    }

    const allKeyframes = keyframes(consistentValues);
    const nameframes = d3.groups(allKeyframes.flatMap(([, data]) => data), (d) => d.zip);
    let prev = new Map(nameframes.flatMap(([, data]) => d3.pairs(data, (a, b) => [b, a])));
    let next = new Map(nameframes.flatMap(([, data]) => d3.pairs(data)));

    const x = d3.scaleLinear([0, 1], [margin.left, width - margin.right]);
    const y = d3.scaleBand()
      .domain(d3.range(topTwelve + 1))
      .rangeRound([margin.top, margin.top + barSize * (topTwelve + 1 + 0.1)])
      .padding(0.1);
    const formatDate = d3.utcFormat('%Y');


    function bars(svg) {
      let bar = svg.append('g')
        .attr('fill-opacity', 0.6)
        .selectAll('rect');

      return ([date, data], transition) => bar = bar
        .data(data.slice(0, 12), (d) => d.zip)
        .join(
          (enter) => enter.append('rect')
            .attr('fill', '#0c8585')
            .attr('height', y.bandwidth())
            .attr('x', x(0))
            .attr('y', (d) => y((prev.get(d) || d).rank))
            .attr('width', (d) => x((prev.get(d) || d).value) - x(0)),
          (update) => update,
          (exit) => exit.transition(transition).remove()
            .attr('y', (d) => y((next.get(d) || d).rank))
            .attr('width', (d) => x((next.get(d) || d).value) - x(0)),
        )
        .call((bar) => bar.transition(transition)
          .attr('y', (d) => y(d.rank))
          .attr('width', (d) => x(d.value) - x(0)));
    }

    function textTween(a, b) {
      const i = d3.interpolateNumber(a, b);
      return function(t) {
        this.textContent = formatNumber(i(t));
      };
    }

    formatNumber = d3.format(',d');

    function labels(svg) {
      let label = svg.append('g')
        .style('font', 'bold 12px var(--sans-serif)')
        .style('font-variant-numeric', 'tabular-nums')
        .attr('text-anchor', 'end')
        .selectAll('text');

      return ([date, data], transition) => label = label
        .data(data.slice(0, 12), d => d.name)
        .join(
          (enter) => enter.append('text')
            .attr('transform', d => `translate(${x((prev.get(d) || d).value)},${y((prev.get(d) || d).rank)})`)
            .attr('y', y.bandwidth() / 2)
            .attr('x', -6)
            .attr('dy', '-0.25em')
            .text(d => d.name)
            .call(text => text.append('tspan')
              .attr('fill-opacity', 0.7)
              .attr('font-weight', 'normal')
              .attr('x', -6)
              .attr('dy', '1.15em')),
          (update) => update,
          (exit) => exit.transition(transition).remove()
            .attr('transform', d => `translate(${x((next.get(d) || d).value)},${y((next.get(d) || d).rank)})`)
            .call(g => g.select('tspan').tween('text', d => textTween(d.value, (next.get(d) || d).value)))
        )
        .call((bar) => bar.transition(transition)
          .attr('transform', d => `translate(${x(d.value)},${y(d.rank)})`)
          .call(g => g.select('tspan').tween('text', d => textTween((prev.get(d) || d).value, d.value))))
    }

    const updateBars = bars(svg);
    const updateLabels = labels(svg);

    async function codeToRun() {
      for (i = 0; i < 20; i += 1) {
        // debugger;
        const transition = svg.transition().duration(500).ease(d3.easeLinear);
        x.domain([0, allKeyframes[i][1][0].value]);
        updateBars(allKeyframes[i], transition);
        updateLabels(allKeyframes[i], transition);
        await transition.end();
      }
    }

    codeToRun();

    // function axis(svg) {
    //   const g = svg.append('g')
    //     .attr('transform', `translate(0,${margin.top})`);

    //   const axis = d3.axisTop(x)
    //     .ticks(width / 160)
    //     .tickSizeOuter(0)
    //     .tickSizeInner(-barSize * (n + y.padding()));

    //   return (_, transition) => {
    //     g.transition(transition).call(axis);
    //     g.select('.tick:first-of-type text').remove();
    //     g.selectAll('.tick:not(:first-of-type) line').attr('stroke', 'white');
    //     g.select('.domain').remove();
    //   };
    // }

    // function ticker(svg) {
    //   const now = svg.append('text')
    //     .style('font', `bold ${barSize}px var(--sans-serif)`)
    //     .style('font-variant-numeric', 'tabular-nums')
    //     .attr('text-anchor', 'end')
    //     .attr('x', width - 6)
    //     .attr('y', margin.top + barSize * (n - 0.45))
    //     .attr('dy', '0.32em')
    //     .text(formatDate(keyframes[0][0]));

    //   return ([date], transition) => {
    //     transition.end().then(() => now.text(formatDate(date)));
    //   };
    // }
    //
  });
});
