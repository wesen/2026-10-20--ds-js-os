define dso_local noundef i32 @row(ptr nocapture noundef %work, i32 noundef %y) local_unnamed_addr #0 {
entry:
  %invariant.gep = getelementptr i8, ptr %work, i32 3094
  %invariant.gep53 = getelementptr i8, ptr %work, i32 3414
  br label %for.body

for.cond.cleanup:                                 ; preds = %for.body
  %add.ptr.i = getelementptr %struct.buffer, ptr %work, i32 9
  %0 = load i16, ptr %add.ptr.i, align 2
  %conv = zext i16 %0 to i32
  %invariant.gep63 = getelementptr %struct.buffer, ptr %work, i32 2
  %invariant.gep65 = getelementptr i8, ptr %work, i32 10
  %invariant.gep67 = getelementptr %struct.buffer, ptr %work, i32 3
  %invariant.gep69 = getelementptr %struct.buffer, ptr %work, i32 21
  %cmp571.not = icmp eq i16 %0, 0
  br i1 %cmp571.not, label %for.cond.cleanup7, label %for.body8.lr.ph

for.body8.lr.ph:                                  ; preds = %for.cond.cleanup
  %invariant.gep56 = getelementptr %struct.buffer, ptr %work, i32 261
  br label %for.body8

for.body:                                         ; preds = %entry, %for.body
  %x.055 = phi i32 [ 0, %entry ], [ %inc, %for.body ]
  %gep = getelementptr i16, ptr %invariant.gep, i32 %x.055
  store i16 0, ptr %gep, align 2
  %gep54 = getelementptr i16, ptr %invariant.gep53, i32 %x.055
  store i16 0, ptr %gep54, align 2
  %inc = add nuw nsw i32 %x.055, 1
  %exitcond.not = icmp eq i32 %inc, 160
  br i1 %exitcond.not, label %for.cond.cleanup, label %for.body, !llvm.loop !4

for.cond.cleanup7:                                ; preds = %for.cond.cleanup28, %for.cond.cleanup
  ret i32 1

for.body8:                                        ; preds = %for.body8.lr.ph, %for.cond.cleanup28
  %s.072 = phi i32 [ 0, %for.body8.lr.ph ], [ %inc58, %for.cond.cleanup28 ]
  %mul = mul nuw nsw i32 %s.072, 5
  %gep64 = getelementptr i16, ptr %invariant.gep63, i32 %mul
  %1 = load i16, ptr %gep64, align 2
  %conv12 = zext i16 %1 to i32
  %sub = sub i32 %y, %conv12
  %gep66 = getelementptr i16, ptr %invariant.gep65, i32 %mul
  %2 = load i16, ptr %gep66, align 2
  %conv15 = zext i16 %2 to i32
  %gep68 = getelementptr i16, ptr %invariant.gep67, i32 %mul
  %3 = load i16, ptr %gep68, align 2
  %conv18 = zext i16 %3 to i32
  %add31 = add i32 %sub, %conv18
  %sub32 = sub i32 %conv18, %sub
  %sub21 = mul i32 %add31, %sub32
  %mul22 = mul nuw nsw i32 %s.072, 160
  %gep70 = getelementptr i16, ptr %invariant.gep69, i32 %mul22
  %4 = trunc i32 %s.072 to i16
  %conv50 = add i16 %4, 1
  br label %for.body29

for.cond.cleanup28:                               ; preds = %if.end53
  %inc58 = add nuw nsw i32 %s.072, 1
  %exitcond74.not = icmp eq i32 %inc58, %conv
  br i1 %exitcond74.not, label %for.cond.cleanup7, label %for.body8, !llvm.loop !6

for.body29:                                       ; preds = %for.body8, %if.end53
  %x24.062 = phi i32 [ 0, %for.body8 ], [ %inc55, %if.end53 ]
  %add.ptr.i44 = getelementptr i16, ptr %gep70, i32 %x24.062
  %5 = load i16, ptr %add.ptr.i44, align 2
  %conv32 = zext i16 %5 to i32
  %sub33 = sub i32 %sub21, %conv32
  %cmp34 = icmp sgt i32 %sub33, -1
  br i1 %cmp34, label %if.then, label %if.end53

if.then:                                          ; preds = %for.body29
  %gep57 = getelementptr i16, ptr %invariant.gep56, i32 %sub33
  %6 = load i16, ptr %gep57, align 2
  %conv38 = zext i16 %6 to i32
  %sub39 = sub nsw i32 %conv15, %conv38
  %gep59 = getelementptr i16, ptr %invariant.gep, i32 %x24.062
  %7 = load i16, ptr %gep59, align 2
  %tobool.not = icmp eq i16 %7, 0
  %conv42 = zext i16 %7 to i32
  %cmp43 = icmp slt i32 %sub39, %conv42
  %or.cond = select i1 %tobool.not, i1 true, i1 %cmp43
  br i1 %or.cond, label %if.then45, label %if.end53

if.then45:                                        ; preds = %if.then
  %conv46 = trunc i32 %sub39 to i16
  store i16 %conv46, ptr %gep59, align 2
  %gep61 = getelementptr i16, ptr %invariant.gep53, i32 %x24.062
  store i16 %conv50, ptr %gep61, align 2
  br label %if.end53

if.end53:                                         ; preds = %if.then45, %if.then, %for.body29
  %inc55 = add nuw nsw i32 %x24.062, 1
  %exitcond73.not = icmp eq i32 %inc55, 160
  br i1 %exitcond73.not, label %for.cond.cleanup28, label %for.body29, !llvm.loop !7
}
