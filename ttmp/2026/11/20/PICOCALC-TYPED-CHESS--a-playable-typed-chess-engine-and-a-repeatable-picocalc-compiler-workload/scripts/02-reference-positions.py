"""Produce independent chess move, mate-in-one and perft oracles with chess==1.11.2."""
import argparse
import json
from pathlib import Path

import chess


POSITIONS = [
    ("opening", chess.STARTING_FEN, 3),
    ("castling-both-sides", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", 2),
    ("castling-through-attack", "4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1", 2),
    ("en-passant-pinned", "k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", 2),
    ("en-passant-legal", "k7/8/8/3pP3/8/8/8/4K3 w - d6 0 2", 2),
    ("promotion-and-underpromotion", "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", 2),
    ("mate-in-one", "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", 2),
    ("mate-in-one-black", "4r1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", 2),
    ("quiet-mate-in-two", "k7/8/3K4/4Q3/8/8/8/8 w - - 0 1", 2),
    ("stalemate", "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", 2),
    ("checkmate", "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1", 2),
    ("defended-rook", "3r2k1/5ppp/8/3p4/8/8/5PPP/3Q2K1 w - - 0 1", 2),
]


def perft(board, depth):
    if depth == 0:
        return 1
    total = 0
    for move in board.legal_moves:
        board.push(move)
        total += perft(board, depth - 1)
        board.pop()
    return total


def position(name, fen, depth):
    board = chess.Board(fen)
    if not board.is_valid():
        raise ValueError(f"{name} is not a valid chess position")
    legal = sorted(move.uci() for move in board.legal_moves)
    mates = []
    for move in legal:
        board.push_uci(move)
        if board.is_checkmate():
            mates.append(move)
        board.pop()
    return dict(name=name, fen=fen, legal_uci=legal, mate_in_one_uci=mates,
                in_check=board.is_check(), checkmate=board.is_checkmate(),
                stalemate=board.is_stalemate(),
                perft={str(d): perft(board, d) for d in range(1, depth + 1)})


def forced_mate_in_two(fen):
    """For each winning root move publish a witness against every legal reply."""
    board = chess.Board(fen)
    wins = {}
    for root_move in list(board.legal_moves):
        board.push(root_move)
        replies = list(board.legal_moves)
        witnesses = {}
        for reply in replies:
            board.push(reply)
            mates = []
            for move in list(board.legal_moves):
                board.push(move)
                if board.is_checkmate():
                    mates.append(move.uci())
                board.pop()
            board.pop()
            if not mates:
                break
            witnesses[reply.uci()] = sorted(mates)
        if replies and len(witnesses) == len(replies):
            wins[root_move.uci()] = witnesses
        board.pop()
    return wins


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    if chess.__version__ != "1.11.2":
        raise ValueError("the reference implementation must be chess==1.11.2")
    rows = [position(*config) for config in POSITIONS]
    cases = {row["name"]: row for row in rows}
    assert cases["opening"]["perft"] == {"1": 20, "2": 400, "3": 8902}
    assert cases["mate-in-one"]["mate_in_one_uci"] == ["e1e8"]
    assert cases["mate-in-one-black"]["mate_in_one_uci"] == ["e8e1"]
    quiet = cases["quiet-mate-in-two"]
    quiet["mate_in_two_witnesses"] = forced_mate_in_two(quiet["fen"])
    assert not quiet["mate_in_one_uci"] and list(quiet["mate_in_two_witnesses"]) == ["d6c7"]
    bait = chess.Board(cases["defended-rook"]["fen"])
    for move in ("d1d5", "d8d5"):
        assert bait.is_capture(bait.parse_uci(move))
        bait.push_uci(move)
    cases["defended-rook"]["poisoned_pawn_line"] = ["d1d5", "d8d5"]
    assert "e5d6" in cases["en-passant-legal"]["legal_uci"]
    assert "e5d6" not in cases["en-passant-pinned"]["legal_uci"]
    assert "e1g1" not in cases["castling-through-attack"]["legal_uci"]
    assert cases["stalemate"]["stalemate"] and cases["checkmate"]["checkmate"]
    args.output.write_text(json.dumps({"reference": "chess 1.11.2", "positions": rows}, indent=2) + "\n")


if __name__ == "__main__":
    main()
