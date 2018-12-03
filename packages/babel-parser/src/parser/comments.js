// @flow

import BaseParser from "./base";
import type { Comment, Node } from "../types";
import { types as tt } from "../tokenizer/types";
import type { Position } from "../util/location";
import type { TokenType } from "../tokenizer/types";

export type TokenTreeItem = {
  type: "",
  tokType: TokenType,
  start: number,
  end: number,
  loc: {
    start: Position,
    end: Position,
  },
};

export default class CommentsParser extends BaseParser {
  addComment(comment: Comment): void {
    if (this.filename) comment.loc.filename = this.filename;

    this.state.commentQueue.push(comment);
  }

  processTokenOnFinish(): void {
    const { commentTokenTree, start, end, startLoc, endLoc, type } = this.state;

    commentTokenTree.push({
      type: "",
      tokType: type,
      start,
      end,
      loc: {
        start: startLoc,
        end: endLoc,
      },
    });
  }

  processNodeOnFinish(node: Node): void {
    const { commentQueue } = this.state;

    const children = this._pushTokenTreeNode(node);

    // Find the start of the comments for this node's children.
    const firstCommentIndex = this._findCommentQueueStart(node);
    let commentIndex = firstCommentIndex;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === "") continue;

      // Apply any applicable leading comments.
      while (
        commentIndex < commentQueue.length &&
        commentQueue[commentIndex].end <= child.start
      ) {
        child.leadingComments = child.leadingComments || [];
        child.leadingComments.push(commentQueue[commentIndex]);
        commentIndex += 1;
      }

      // Apply any applicable inner comments.
      while (
        commentIndex < commentQueue.length &&
        commentQueue[commentIndex].end <= child.end
      ) {
        child.innerComments = child.innerComments || [];
        child.innerComments.push(commentQueue[commentIndex]);
        commentIndex += 1;
      }

      const {
        maxEnd = node.end,
        maxLine = Infinity,
      } = this._buildTrailingCommentMetadata(child, children, i);

      while (
        commentIndex < commentQueue.length &&
        commentQueue[commentIndex].end <= maxEnd &&
        commentQueue[commentIndex].loc.start.line <= maxLine
      ) {
        child.trailingComments = child.trailingComments || [];
        child.trailingComments.push(commentQueue[commentIndex]);
        commentIndex += 1;
      }
    }

    if (commentIndex !== firstCommentIndex) {
      commentQueue.splice(firstCommentIndex, commentIndex - firstCommentIndex);
    }
  }

  /**
   * Find the index of the first comment that comes after the start off
   * the given node, if there is one.
   */
  _findCommentQueueStart(node: Node): number {
    const { commentQueue } = this.state;

    // We start at the index we ended with last time because the vast majority
    // of the time it should already be the right index, since we exit nodes
    // much more frequently than we attach comments.
    // We could also do a binary search for the index, since the comment queue
    // is a sorted list, but we'd likely want benchmarks showing the complexity
    // would actually be worth it.
    let firstCommentIndex = this.state.commentQueueLastIndex;
    while (
      firstCommentIndex - 1 >= 0 &&
      firstCommentIndex - 1 < commentQueue.length &&
      commentQueue[firstCommentIndex - 1].end > node.start
    ) {
      firstCommentIndex--;
    }
    while (
      firstCommentIndex < commentQueue.length &&
      commentQueue[firstCommentIndex].end <= node.start
    ) {
      firstCommentIndex++;
    }
    this.state.commentQueueLastIndex = firstCommentIndex;

    return firstCommentIndex;
  }

  /**
   * The 'commentTokenTree' structure is essentially a list of all parents and
   * and all previous siblings. Whenever a node is pushed, we're essentially
   * replacing any nodes or tokens that are within the node's range with
   * the node itself. This means that as we are attaching comments, we can
   * easily access nodes as well as sibling nodes/tokens.
   */
  _pushTokenTreeNode(node: Node): Array<Node | TokenTreeItem> {
    const { commentTokenTree } = this.state;

    // Pop any tokens and child nodes that are inside the node being finished,
    // so we can walk through them to apply comments to them.
    let commentStackStart = commentTokenTree.length;
    while (
      commentStackStart - 1 >= 0 &&
      commentTokenTree[commentStackStart - 1].start >= node.start
    ) {
      commentStackStart--;
    }
    let commentStackEnd = commentStackStart;
    while (
      commentStackEnd < commentTokenTree.length &&
      commentTokenTree[commentStackEnd].end <= node.end
    ) {
      commentStackEnd++;
    }

    const children = commentTokenTree.splice(
      commentStackStart,
      commentStackEnd - commentStackStart,
      node,
    );

    // The parser may 'finish' a node multiple times in some cases, so we
    // need to make sure that we don't consider the already-pushed node
    // as its own child.
    if (children.length > 0 && children[0] === node) {
      children.shift();
    }

    return children;
  }

  /**
   * Build metadata about how far ahead of the current node we should look
   * when searching for trailing comments to the given child node.
   */
  _buildTrailingCommentMetadata(
    child: Node,
    children: Array<Node | TokenTreeItem>,
    // This is always 'children.indexOf(child)', but recalculating that
    // would be a waste.
    childIndex: number,
  ): {
    maxEnd: number | void,
    maxLine: number | void,
  } {
    let nextSiblingNode = null;
    const nextSiblingTokens = [];
    for (let j = childIndex + 1; j < children.length; j++) {
      const sibling = children[j];

      if (sibling.type !== "") {
        nextSiblingNode = sibling;
        break;
      }
      nextSiblingTokens.push(sibling);
    }

    if (!nextSiblingNode) {
      return {
        // If there is no next node, we leave the value 'undefined' so the
        // caller can set the proper bound based on the parent context.
        maxEnd: undefined,
      };
    }

    const tok = nextSiblingTokens[0];
    const nextTok = nextSiblingTokens[1];

    const permeableFirstToken =
      tok && (tok.tokType === tt.comma || tok.tokType === tt.semi);

    const firstItem = permeableFirstToken ? tok : child;
    const nextItem = nextTok || nextSiblingNode;

    const maxEnd =
      firstItem.loc.end.line === nextItem.loc.start.line
        ? firstItem.end
        : nextItem.start;

    const maxLine =
      firstItem.loc.end.line === nextItem.loc.start.line
        ? undefined
        : firstItem.loc.end.line;
    return { maxEnd, maxLine };

    // if (nextSiblingTokens.length === 0) {
    //   if (child.loc.end.line === nextSiblingNode.loc.start.line) {
    //     // Use the child end as an easy way to bail out and not collect
    //     // any comments. If they are on the same line, all comments
    //     // will become leading comments on the next sibling instead.
    //     return {
    //       maxEnd: child.end,
    //     };
    //   } else {
    //     // Take any trailing comments that start on the same line
    //     // that the child itself ends on.
    //     return {
    //       maxEnd: nextSiblingNode.start,
    //       maxLine: child.loc.end.line,
    //     };
    //   }
    // }
    // const tok = nextSiblingTokens[0];
    // if (!(tok.tokType === tt.comma || tok.tokType === tt.semi)) {
    //   return {
    //     // Accept any commments between the node and the next token.
    //     maxEnd: tok.start,
    //   };
    // }
    // if (nextSiblingTokens.length === 1) {
    //   if (tok.loc.start.line === nextSiblingNode.loc.start.line) {
    //     return {
    //       maxEnd: tok.start,
    //     };
    //   }
    //
    //   return {
    //     maxEnd: nextSiblingNode.start,
    //     maxLine: tok.loc.start.line,
    //   };
    // }
    // const nextTok = nextSiblingTokens[1];
    // return {
    //   maxEnd: nextTok.start,
    //   maxLine: tok.loc.start.line,
    // };
  }
}
