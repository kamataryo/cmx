type MurasameExecutor<T> = (params: T, phrases?: string[]) => void;

export default class MurasameNode<Params> {
  static isOption = (phrase: string) => {
    const yesNoMatch = phrase.match(/^-(?<key>[a-z,A-Z,0-9])+$/);
    const keyValueMatch = phrase.match(
      /^--(?<key>[a-z,A-Z][a-z,A-Z,0-9]+)(=(?<value>.+))?$/
    );
    return { yesNoMatch, keyValueMatch };
  };

  phrase: string;
  private description?: string;
  private defaultParams?: any;
  private executor?: MurasameExecutor<Params>;
  private childNodes: MurasameNode<any>[] = [];
  constructor(
    phrase: string,
    options: string | { description?: string; defaultParams?: any } = {},
    executor?: MurasameExecutor<Params>
  ) {
    this.phrase = phrase;
    this.executor = executor;

    if (typeof options === "string") {
      this.description = options;
      this.defaultParams = {};
    } else {
      this.description = options.description || "";
      this.defaultParams = options.defaultParams || {};
    }
  }

  registerChildNode<ChildParams>(
    phrase: string,
    options: string | { description?: string; defaultParams?: any } = {},
    executor?: MurasameExecutor<ChildParams>
  ): MurasameNode<ChildParams> {
    const node = new MurasameNode<ChildParams>(phrase, options, executor);
    this.childNodes.push(node);
    return node;
  }

  private findChildNode(phrase: string): MurasameNode<any> | false {
    for (let node of this.childNodes) {
      if (node.phrase === phrase) {
        return node;
      }
    }
    return false;
  }

  exec(...phrases: string[]): boolean {
    const params: any = {};
    const traversedPhrases = [this.phrase];
    let currentNode: MurasameNode<Params> = this;
    for (let phrase of phrases) {
      const { yesNoMatch, keyValueMatch } = MurasameNode.isOption(phrase);
      if (yesNoMatch) {
        params[yesNoMatch.groups.key] = true;
      } else if (keyValueMatch) {
        params[keyValueMatch.groups.key] = keyValueMatch.groups.value;
      } else {
        const nextNode = currentNode.findChildNode(phrase);
        if (nextNode) {
          traversedPhrases.push(phrase);
          currentNode = nextNode;
        } else {
          process.stderr.write("no such command");
          return false;
        }
      }
    }

    currentNode.executor(
      { ...currentNode.defaultParams, ...params },
      traversedPhrases
    );
    return true;
  }
}
