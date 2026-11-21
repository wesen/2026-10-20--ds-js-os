define dso_local noundef i32 @row(ptr nocapture noundef %work, i32 noundef %y) local_unnamed_addr #0 {
entry:
  %data.i35 = getelementptr inbounds %struct.buffer, ptr %work, i32 0, i32 1
  br label %for.body

for.cond.cleanup:                                 ; preds = %element.exit42
  %0 = load i32, ptr %work, align 4
  %cmp.not.i = icmp ugt i32 %0, 16
  br i1 %cmp.not.i, label %element.exit, label %if.then.i

if.then.i:                                        ; preds = %for.cond.cleanup
  tail call void @llvm.trap()
  unreachable

element.exit:                                     ; preds = %for.cond.cleanup
  %add.ptr.i = getelementptr %struct.buffer, ptr %work, i32 9
  %1 = load i16, ptr %add.ptr.i, align 2
  %conv = zext i16 %1 to i32
  %cmp585.not = icmp eq i16 %1, 0
  br i1 %cmp585.not, label %for.cond.cleanup7, label %for.body8

for.body:                                         ; preds = %entry, %element.exit42
  %x.083 = phi i32 [ 0, %entry ], [ %inc, %element.exit42 ]
  %add = add nuw nsw i32 %x.083, 1545
  %2 = load i32, ptr %work, align 4
  %cmp.not.i33 = icmp ugt i32 %2, %add
  br i1 %cmp.not.i33, label %element.exit37, label %if.then.i34

if.then.i34:                                      ; preds = %for.body
  tail call void @llvm.trap()
  unreachable

element.exit37:                                   ; preds = %for.body
  %add.ptr.i36 = getelementptr i16, ptr %data.i35, i32 %add
  store i16 0, ptr %add.ptr.i36, align 2
  %add1 = add nuw nsw i32 %x.083, 1705
  %3 = load i32, ptr %work, align 4
  %cmp.not.i38 = icmp ugt i32 %3, %add1
  br i1 %cmp.not.i38, label %element.exit42, label %if.then.i39

if.then.i39:                                      ; preds = %element.exit37
  tail call void @llvm.trap()
  unreachable

element.exit42:                                   ; preds = %element.exit37
  %add.ptr.i41 = getelementptr i16, ptr %data.i35, i32 %add1
  store i16 0, ptr %add.ptr.i41, align 2
  %inc = add nuw nsw i32 %x.083, 1
  %exitcond.not = icmp eq i32 %inc, 160
  br i1 %exitcond.not, label %for.cond.cleanup, label %for.body, !llvm.loop !4

for.cond.cleanup7:                                ; preds = %for.cond.cleanup28, %element.exit
  ret i32 1

for.body8:                                        ; preds = %element.exit, %for.cond.cleanup28
  %s.086 = phi i32 [ %inc58, %for.cond.cleanup28 ], [ 0, %element.exit ]
  %mul = mul nuw nsw i32 %s.086, 5
  %add10 = add nuw nsw i32 %mul, 2
  %4 = load i32, ptr %work, align 4
  %cmp.not.i43 = icmp ugt i32 %4, %add10
  br i1 %cmp.not.i43, label %element.exit47, label %if.then.i44

if.then.i44:                                      ; preds = %for.body8
  tail call void @llvm.trap()
  unreachable

element.exit47:                                   ; preds = %for.body8
  %add.ptr.i46 = getelementptr i16, ptr %data.i35, i32 %add10
  %5 = load i16, ptr %add.ptr.i46, align 2
  %conv12 = zext i16 %5 to i32
  %sub = sub i32 %y, %conv12
  %add13 = add nuw nsw i32 %mul, 3
  %cmp.not.i48 = icmp ugt i32 %4, %add13
  br i1 %cmp.not.i48, label %element.exit52, label %if.then.i49

if.then.i49:                                      ; preds = %element.exit47
  tail call void @llvm.trap()
  unreachable

element.exit52:                                   ; preds = %element.exit47
  %add.ptr.i51 = getelementptr i16, ptr %data.i35, i32 %add13
  %6 = load i16, ptr %add.ptr.i51, align 2
  %conv15 = zext i16 %6 to i32
  %add16 = add nuw nsw i32 %mul, 4
  %cmp.not.i53 = icmp ugt i32 %4, %add16
  br i1 %cmp.not.i53, label %element.exit57, label %if.then.i54

if.then.i54:                                      ; preds = %element.exit52
  tail call void @llvm.trap()
  unreachable

element.exit57:                                   ; preds = %element.exit52
  %add.ptr.i56 = getelementptr i16, ptr %data.i35, i32 %add16
  %7 = load i16, ptr %add.ptr.i56, align 2
  %conv18 = zext i16 %7 to i32
  %add31 = add i32 %sub, %conv18
  %sub32 = sub i32 %conv18, %sub
  %sub21 = mul i32 %add31, %sub32
  %mul22 = mul nuw nsw i32 %s.086, 160
  %add23 = add nuw nsw i32 %mul22, 40
  %8 = trunc i32 %s.086 to i16
  %conv50 = add i16 %8, 1
  br label %for.body29

for.cond.cleanup28:                               ; preds = %if.end53
  %inc58 = add nuw nsw i32 %s.086, 1
  %exitcond88.not = icmp eq i32 %inc58, %conv
  br i1 %exitcond88.not, label %for.cond.cleanup7, label %for.body8, !llvm.loop !6

for.body29:                                       ; preds = %element.exit57, %if.end53
  %x24.084 = phi i32 [ 0, %element.exit57 ], [ %inc55, %if.end53 ]
  %add30 = add nuw nsw i32 %add23, %x24.084
  %9 = load i32, ptr %work, align 4
  %cmp.not.i58 = icmp ugt i32 %9, %add30
  br i1 %cmp.not.i58, label %element.exit62, label %if.then.i59

if.then.i59:                                      ; preds = %for.body29
  tail call void @llvm.trap()
  unreachable

element.exit62:                                   ; preds = %for.body29
  %add.ptr.i61 = getelementptr i16, ptr %data.i35, i32 %add30
  %10 = load i16, ptr %add.ptr.i61, align 2
  %conv32 = zext i16 %10 to i32
  %sub33 = sub i32 %sub21, %conv32
  %cmp34 = icmp sgt i32 %sub33, -1
  br i1 %cmp34, label %if.then, label %if.end53

if.then:                                          ; preds = %element.exit62
  %add36 = add nuw i32 %sub33, 520
  %cmp.not.i63 = icmp ugt i32 %9, %add36
  br i1 %cmp.not.i63, label %element.exit67, label %if.then.i64

if.then.i64:                                      ; preds = %if.then
  tail call void @llvm.trap()
  unreachable

element.exit67:                                   ; preds = %if.then
  %add.ptr.i66 = getelementptr i16, ptr %data.i35, i32 %add36
  %11 = load i16, ptr %add.ptr.i66, align 2
  %conv38 = zext i16 %11 to i32
  %sub39 = sub nsw i32 %conv15, %conv38
  %add40 = add nuw nsw i32 %x24.084, 1545
  %cmp.not.i68 = icmp ugt i32 %9, %add40
  br i1 %cmp.not.i68, label %element.exit72, label %if.then.i69

if.then.i69:                                      ; preds = %element.exit67
  tail call void @llvm.trap()
  unreachable

element.exit72:                                   ; preds = %element.exit67
  %add.ptr.i71 = getelementptr i16, ptr %data.i35, i32 %add40
  %12 = load i16, ptr %add.ptr.i71, align 2
  %tobool.not = icmp eq i16 %12, 0
  %conv42 = zext i16 %12 to i32
  %cmp43 = icmp slt i32 %sub39, %conv42
  %or.cond = select i1 %tobool.not, i1 true, i1 %cmp43
  br i1 %or.cond, label %element.exit77, label %if.end53

element.exit77:                                   ; preds = %element.exit72
  %conv46 = trunc i32 %sub39 to i16
  store i16 %conv46, ptr %add.ptr.i71, align 2
  %add51 = add nuw nsw i32 %x24.084, 1705
  %13 = load i32, ptr %work, align 4
  %cmp.not.i78 = icmp ugt i32 %13, %add51
  br i1 %cmp.not.i78, label %element.exit82, label %if.then.i79

if.then.i79:                                      ; preds = %element.exit77
  tail call void @llvm.trap()
  unreachable

element.exit82:                                   ; preds = %element.exit77
  %add.ptr.i81 = getelementptr i16, ptr %data.i35, i32 %add51
  store i16 %conv50, ptr %add.ptr.i81, align 2
  br label %if.end53

if.end53:                                         ; preds = %element.exit82, %element.exit72, %element.exit62
  %inc55 = add nuw nsw i32 %x24.084, 1
  %exitcond87.not = icmp eq i32 %inc55, 160
  br i1 %exitcond87.not, label %for.cond.cleanup28, label %for.body29, !llvm.loop !7
}
