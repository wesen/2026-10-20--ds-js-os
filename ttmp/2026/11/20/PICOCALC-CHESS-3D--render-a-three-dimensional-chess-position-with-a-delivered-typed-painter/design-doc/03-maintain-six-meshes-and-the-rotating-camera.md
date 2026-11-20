---
Title: Maintain six Chess meshes and the rotating camera
Ticket: PICOCALC-CHESS-3D
DocType: design-doc
Status: active
Topics:
  - picocalc
  - compiler
---

# Maintain six Chess meshes and the rotating camera

The rotation is a local rendering choice. The Chess world continues to send the ordinary PSIX state, with its cursor, pieces and move endpoints in game coordinates. The receiver writes a phase from 0 through 31 into cell 90 after decoding the 90 PSIX cells, then calls the original two-buffer `paintChess(state, out)` entry. A quarter turn changes phase by eight. The board mesh and the pieces rotate together around the board center. The result carries triangles, rank and file labels, turn status, move endpoints and help in the existing counted drawing vocabulary. [Maintained painter](../../../../../../picocalc-os/worlds/chess/painter-3d.typed)

## Project game coordinates without changing the position

The painter computes sine and cosine with a nine-entry fixed-point quarter-wave table. Scale 256 makes the cardinal phases exact. With `dx = x - 64` and `dz = z - 64`, let `depthX = cos + sin` and `depthZ = cos - sin`. The screen coordinates are:

```text
u = 160 + (depthZ*dx - depthX*dz) / 256
v = 140 + (depthX*dx + depthZ*dz) * 5 / 2048 - y
```

All division uses signed integer truncation. Phase 8 rotates a centered game point `(dx,dz)` to the view point `(-dz,dx)`. The inverse maps a view square `(vf,vr)` to game square `(vr,7-vf)`, matching the receiver's arrow controls. The loop draws each tile from its game coordinates and uses the same projection for the associated model and cursor outline. In intermediate phases the same world point receives a genuinely different projected coordinate.

The board is centered at (64,64) with a side length of 128 world units. Pieces stand within seven units of a tile center and extend up to 30 units vertically. Labels extend to world coordinate −7 or 135 along the view-facing board edges. The largest off-center extent per axis is 71. Since the relevant coefficient magnitude sum is at most 512, the projected horizontal edge and its label remain within the 320-pixel body. The same bound gives a maximum board-plane displacement of 88 pixels vertically. The bottom corner of the slab extends only five more, and the longest piece stays above the upper body edge. The board's command geometry is independently checked at every phase.

## Shape a piece before shading it

A square-section frustum joins two horizontal rings. A ring stores height and half width together as `8 * height + halfWidth`. The pawn stacks six sections into a pedestal, narrow neck and rounded faceted head. Four short square solids form the rook's crenellations. The queen has a flared shoulder and four points arranged around a raised central tip. All three shapes derive from the same ring projection and visible-wall helper, and piece types keep their assigned shapes after promotion.

The knight, bishop and king use an extrusion for the most recognizable part of the shape. An extrusion gives a planar outline thickness, with a face on each side and a wall along each edge. The horse has a sloping head and long muzzle, the bishop has a diagonal notch cut into the mitre, and the king has a cross with actual thickness. The knight points toward the opponent's back rank. The outlines are authored in Python as ordered coordinate pairs. The generator triangulates each cap by repeatedly clipping a convex ear, then groups two cap triples or three outline vertices into i32 constants. The painter fetches a bounded index, unpacks it, and projects the vertex. No extra data buffers or linker imports are needed. [Outline generator](../../../../../../picocalc-os/tools/generate-chess-meshes.py)

Each projected wall has a deterministic screen winding. The renderer uses the winding to keep forward-facing surfaces and skip those facing away. For the extrusion it picks the nearer cap by the depth sign of the thickness axis, then fills the cap's triangles. For chessboard occlusion it computes a scalar depth for each occupied square and selects pieces from far to near, breaking ties by square index. Frusta and projections share exact snapped endpoints at every phase, so the existing triangle fill rule owns seams between their faces. Within this closed scene the painter orders the small assembly parts directly. A more general scene with freely interpenetrating objects would need pixel depth or another occlusion method.

## Reproduce code size and output limits

Run `python3 -B picocalc-os/tools/generate-chess-meshes.py --check` to check the generated extrusion tables. Rebuild the real opening fixtures as described in the scalar guide. Run `node scripts/scene/maintained-poses.mjs FIXTURES OUTPUT` followed by `python3 -B scripts/scene/maintained-raster.py OUTPUT EVIDENCE` from this ticket directory.

The first script compiles the exact source to WebAssembly and RV32, checks both complete arenas for 160 scenes, and recomputes every tile corner independently. It runs the piece generator for both colors, all six kinds, 64 squares and all 32 phases. The second script checks whether all 32 phases produce distinct app pixels for each sampled position and generates the labeled mesh figure.

The frozen source uses 16,316 bytes and emits 23,848 RV32 bytes. The largest observed full scene uses 8,655 words. Exhausting the legal model combinations gives a maximum of 38 triangles per piece. Charging that maximum to all 32 pieces, plus 134 board and cursor triangles, one fill, 16 labels, up to two status records, and one hint gives 1,370 commands and a bound of 11,022 words. A 12,288-word arena leaves 1,266 words of margin. Inputs containing more than 32 occupied squares return zero before the painter touches its output. The receive path can continue using the last valid list.
