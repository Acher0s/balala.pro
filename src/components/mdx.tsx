import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import {
  Band,
  Bands,
  Calc,
  CalcTable,
  Input,
  Output,
  Section,
  Show,
  Toggle,
  Toggles,
  Value,
} from "./calc";
import { Center } from "./center";
import { Column, Columns } from "./columns";
import {
  Booster,
  CardRow,
  Deck,
  Enhancement,
  Joker,
  Planet,
  PlayingCard,
  Seal,
  Spectral,
  Stake,
  Sticker,
  Tag,
  Tarot,
  Voucher,
} from "./game-ref";
import { GuideImage } from "./guide-image";
import { Level } from "./level";
import { TierList } from "./tierlist/tier-list-embed";
import { Tool } from "./tool-embed";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    img: GuideImage,
    Tabs,
    Tab,
    Steps,
    Step,
    Accordions,
    Accordion,
    Joker,
    Tarot,
    Planet,
    Spectral,
    Voucher,
    Enhancement,
    Seal,
    Deck,
    Stake,
    Tag,
    Booster,
    Sticker,
    PlayingCard,
    CardRow,
    Level,
    Center,
    Columns,
    Column,
    Tool,
    TierList,
    Calc,
    Input,
    Output,
    Section,
    Value,
    CalcTable,
    Toggle,
    Toggles,
    Bands,
    Band,
    Show,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
