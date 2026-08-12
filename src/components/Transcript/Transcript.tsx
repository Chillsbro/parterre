import {ScrollBarBox} from "@byteland/ink-scroll-bar";
import {Box, Text} from "ink";
import {ScrollView, type ScrollViewRef} from "ink-scroll-view";
import type React from "react";
import {type Ref, useImperativeHandle, useRef, useState} from "react";
import {parterreTheme} from "../../theme/index.js";
import type {TimelineItem} from "../../transcript/index.js";
import {
  compactContentLabel,
  shouldCompactComposer
} from "../Composer/Composer.js";

function formatTerminalHyperlink(link: {label: string; href: string}): string {
  return `\u001B]8;;${link.href}\u0007${link.label}\u001B]8;;\u0007`;
}

function EmptyState(): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      flexGrow={1}
      justifyContent="center"
    >
      <Text color={parterreTheme.muted}>Describe a task, paste acceptance</Text>
      <Text color={parterreTheme.muted}>
        criteria, or type <Text color={parterreTheme.accent}>/</Text> for
        commands.
      </Text>
    </Box>
  );
}

export interface TranscriptScrollHandle {
  pageUp(): void;
  pageDown(): void;
  scrollLines(delta: number): void;
}

export function Transcript(props: {
  items: TimelineItem[];
  height: number;
  scrollRef?: Ref<TranscriptScrollHandle> | undefined;
}): React.ReactElement {
  const innerRef = useRef<ScrollViewRef>(null);
  const pinnedRef = useRef(true);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const overflowing = viewportHeight > 0 && contentHeight > viewportHeight;
  const safeViewportHeight = Math.max(
    1,
    viewportHeight > 0 ? viewportHeight : props.height - 2
  );
  const safeContentHeight = Math.max(contentHeight, safeViewportHeight);
  const safeScrollOffset = Math.min(
    Math.max(0, scrollOffset),
    safeContentHeight - safeViewportHeight
  );
  useImperativeHandle(props.scrollRef, () => {
    const scrollBy = (delta: number): void => {
      const scroller = innerRef.current;
      if (!scroller) return;
      const bottom = scroller.getBottomOffset();
      const target = Math.min(
        bottom,
        Math.max(0, scroller.getScrollOffset() + delta)
      );
      scroller.scrollTo(target);
      pinnedRef.current = target >= bottom;
    };
    const page = (direction: -1 | 1): void => {
      const scroller = innerRef.current;
      if (!scroller) return;
      scrollBy(direction * Math.max(1, scroller.getViewportHeight() - 1));
    };
    return {
      pageUp: () => page(-1),
      pageDown: () => page(1),
      scrollLines: scrollBy
    };
  });
  return (
    <Box flexDirection="column" height={props.height} flexShrink={0}>
      <ScrollBarBox
        height={props.height}
        borderStyle="round"
        borderColor={parterreTheme.borderSoft}
        borderRightColor={
          overflowing ? parterreTheme.gold : parterreTheme.borderSoft
        }
        scrollBarPosition="right"
        contentHeight={safeContentHeight}
        viewportHeight={safeViewportHeight}
        scrollOffset={safeScrollOffset}
      >
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {props.items.length === 0 ? (
            <EmptyState />
          ) : (
            <ScrollView
              ref={innerRef}
              flexGrow={1}
              onScroll={setScrollOffset}
              onViewportSizeChange={size => setViewportHeight(size.height)}
              onContentHeightChange={height => {
                setContentHeight(height);
                if (pinnedRef.current) innerRef.current?.scrollToBottom();
              }}
            >
              {props.items.map(item => {
                if (item.kind === "user") {
                  return (
                    <Box key={item.id} paddingTop={1}>
                      <Box flexShrink={0}>
                        <Text color={parterreTheme.accentBright}>❯ </Text>
                      </Box>
                      <Text bold color={parterreTheme.text} wrap="wrap">
                        {shouldCompactComposer(item.content)
                          ? compactContentLabel(item.content)
                          : item.content}
                      </Text>
                    </Box>
                  );
                }
                if (item.kind === "tool") {
                  return (
                    <Box key={item.id} paddingLeft={2}>
                      <Box flexShrink={0}>
                        <Text
                          color={
                            item.ok ? parterreTheme.faint : parterreTheme.error
                          }
                        >
                          {item.ok ? "· " : "✗ "}
                        </Text>
                      </Box>
                      <Text color={parterreTheme.muted} wrap="truncate-end">
                        {item.content}
                        {item.detail ? (
                          <Text
                            color={parterreTheme.faint}
                          >{`  ${item.detail}`}</Text>
                        ) : null}
                        {item.link ? (
                          <Text color={parterreTheme.accentBright} underline>
                            {formatTerminalHyperlink(item.link)}
                          </Text>
                        ) : null}
                      </Text>
                    </Box>
                  );
                }
                if (item.kind === "error") {
                  return (
                    <Box key={item.id} paddingTop={1}>
                      <Text color={parterreTheme.error} wrap="wrap">
                        ✗ {item.content}
                      </Text>
                    </Box>
                  );
                }
                return (
                  <Box key={item.id} paddingTop={1} paddingLeft={1}>
                    <Text color={parterreTheme.text} wrap="wrap">
                      {item.content}
                    </Text>
                  </Box>
                );
              })}
            </ScrollView>
          )}
        </Box>
      </ScrollBarBox>
      <Box height={0} marginTop={-props.height} marginLeft={2}>
        <Text> </Text>
        <Text color={parterreTheme.gold}>❖</Text>
        <Text color={parterreTheme.muted}> parterre</Text>
        <Text> </Text>
      </Box>
    </Box>
  );
}
