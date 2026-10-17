type BaseEventType = {
  length: number;
  slug: string;
  title: string;
};

const thirtyMinutes: BaseEventType = {
  length: 30,
  slug: "thirty-minutes",
  title: "30 Minutes",
};

const sixtyMinutes: BaseEventType = {
  length: 60,
  slug: "sixty-minutes",
  title: "60 Minutes",
};

export const DEFAULT_EVENT_TYPES = {
  thirtyMinutes,
  sixtyMinutes,
};
