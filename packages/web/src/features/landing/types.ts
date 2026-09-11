// Same as govaiForHomepage type in `genai/packages/cdk/lib/stack-input.ts`
export type RecommendedGovAI = {
  title: string;
  description: string;
  teamId: string;
  exAppId: string;
  // MCPサーバ/MCPエージェント系アプリかどうか（おすすめ一覧では下部の目立たない領域に表示する）
  isMcp?: boolean;
};
