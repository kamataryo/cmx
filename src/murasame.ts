import * as shlex from "shlex";
import * as table from "text-table";

export type MurasameOptions = {
  [key: string]: {
    isRequired: boolean;
    description: string;
    default: string | boolean;
    type: string;
  };
};

export type MurasameHelp = {
  phrase: string;
  description?: string;
  options: MurasameOptions;
  sub: MurasameHelp[];
};

export type MurasameExecutor<T = any> = (
  args: string[],
  options: T,
  helps: MurasameHelp,
  phrases?: string[]
) => any;

export default class MurasameNode<T1 = any> {
  static isOption = (phrase: string) => {
    const yesNoMatch = phrase.match(/^-([a-z,A-Z,0-9])+$/);
    const keyValueMatch = phrase.match(/^--([a-z,A-Z][a-z,A-Z,0-9]+)=(.+)$/);
    return { yesNoMatch, keyValueMatch };
  };

  private phrase: string;
  private description?: string;
  private options: MurasameOptions = {}; // parameter definitions
  private executor?: MurasameExecutor<T1>;
  private childNodes: MurasameNode<any>[] = [];
  private parent: MurasameNode<any>;
  constructor(phrase: string, parent?: MurasameNode<any>) {
    this.phrase = phrase;
    this.parent = parent || this;
  }

  describe(description: string) {
    this.description = description;
    return this;
  }

  option(
    key: string | string[],
    options: {
      isRequired?: boolean;
      description?: string;
      default?: boolean | string;
    } = {}
  ) {
    const keys = Array.isArray(key) ? key : [key];
    const additionalOptions = keys.reduce(
      (prev, key) => ({
        ...prev,
        [key]: {
          isRequired: options.isRequired || false,
          description: options.description || "",
          default:
            key.length === 1 ? !!options.default : options.default.toString(),
          type: keys[0]
        }
      }),
      {}
    );

    this.options = {
      ...this.options,
      ...additionalOptions
    };
    return this;
  }

  action(action: MurasameExecutor<T1>) {
    this.executor = action;
    return this;
  }

  help() {
    this.executor = murasameHelpWriter;
    return this;
  }

  sub<T2>(phrase: string): MurasameNode<T2> {
    const node = new MurasameNode<T2>(phrase, this);
    this.childNodes.push(node);
    return node;
  }

  super() {
    return this.parent;
  }

  private findChildNode(phrase: string): MurasameNode<any> | false {
    for (let node of this.childNodes) {
      if (node.phrase === phrase) {
        return node;
      }
    }
    return false;
  }

  private getHelps(): MurasameHelp {
    return {
      phrase: this.phrase,
      description: this.description || "",
      options: this.options,
      sub: this.childNodes.map(node => node.getHelps())
    };
  }

  exec(...phrases: string[]): boolean {
    const args: string[] = [];
    const options: any = {};
    const traversedPhrases = [this.phrase];
    let currentNode: MurasameNode<T1> = this;

    for (let phrase of phrases) {
      const { yesNoMatch, keyValueMatch } = MurasameNode.isOption(phrase);
      if (yesNoMatch) {
        options[yesNoMatch[1]] = true;
      } else if (keyValueMatch) {
        // solve quoted options like --url="https://example.com"
        options[keyValueMatch[1]] = shlex.split(keyValueMatch[2])[0];
      } else {
        const nextNode = currentNode.findChildNode(phrase);
        if (nextNode) {
          traversedPhrases.push(phrase);
          currentNode = nextNode;
        } else {
          args.push(phrase);
        }
      }
    }

    const defaultOptions = Object.keys(currentNode.options).reduce(
      (prev, key) => {
        return { ...prev, [key]: currentNode.options[key].default };
      },
      {}
    );

    // check options type
    for (let key of Object.keys(currentNode.options)) {
      const { isRequired } = currentNode.options[key];
      if (isRequired && options[key] === void 0) {
        process.stderr.write(`${key} is required, but not given.`);
        return false;
      }
    }

    typeof currentNode.executor === "function" &&
      currentNode.executor(
        args,
        { ...defaultOptions, ...options },
        this.getHelps(),
        traversedPhrases
      );

    return true;
  }

  async execAsync(...phrases: string[]) {
    return this.exec(...phrases);
  }

  parse() {
    const [, , ...args] = process.argv;
    return this.exec(...args);
  }

  parseAsync() {
    const [, , ...args] = process.argv;
    return this.execAsync(...args);
  }
}

const murasameHelpWriter = (
  _0: any,
  _1: any,
  help: MurasameHelp,
  traversedPhrases: string[]
) => {
  const { description, options, sub } = help;

  const parentalPhrases = traversedPhrases.splice(
    0,
    traversedPhrases.length - 1
  );

  const optionLines =
    Object.keys(options).length > 0
      ? `Options:
${table(
  Object.keys(options).map(key => {
    const displayOption = key.length > 1 ? `--${key}` : `-${key}`;
    const defaultValue = options[key].default
      ? `[${options[key].default}]`
      : "";
    return ["    ", displayOption, defaultValue, options[key].description];
  })
)}`
      : "";

  const commandLines =
    sub.length > 0
      ? `Commands:
${table(sub.map(({ phrase, description }) => ["    ", phrase, description]))}`
      : "";

  process.stdout.write(
    [
      `Usage: ${parentalPhrases.join(" ")} [command] [options]`,
      "",
      description,
      "",
      optionLines,
      ``,
      commandLines,
      ""
    ].join("\n")
  );
};
