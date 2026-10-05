import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import type { Candle } from '@market-reader/core';
import { useTheme } from '../lib/theme';

/** Lightweight area chart of closing prices, drawn with SVG. */
export function LineChart({ candles, height = 220 }: { candles: Candle[]; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);

  const shape = useMemo(() => {
    if (width === 0 || candles.length < 2) return null;
    const closes = candles.map((c) => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const pad = (max - min) * 0.08 || max * 0.01 || 1;
    const lo = min - pad;
    const hi = max + pad;
    const x = (i: number) => (i / (candles.length - 1)) * width;
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
    const line = closes.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${width} ${height} L0 ${height} Z`;
    const rising = closes[closes.length - 1] >= (candles[0].open || closes[0]);
    return { line, area, rising, baseY: y(candles[0].open || closes[0]) };
  }, [candles, width, height]);

  const color = shape?.rising ? t.up : t.down;
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {shape && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.22} />
              <Stop offset="1" stopColor={color} stopOpacity={0.01} />
            </LinearGradient>
          </Defs>
          <Line x1={0} x2={width} y1={shape.baseY} y2={shape.baseY} stroke={t.rule} strokeDasharray="4 4" />
          <Path d={shape.area} fill="url(#fill)" />
          <Path d={shape.line} stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      )}
    </View>
  );
}
