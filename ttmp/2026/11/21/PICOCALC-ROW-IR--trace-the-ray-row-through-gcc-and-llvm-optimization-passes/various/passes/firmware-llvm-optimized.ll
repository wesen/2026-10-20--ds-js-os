define internal fastcc i32 @trace_row(ptr noundef %work, i32 noundef %y, i32 noundef %mode, i1 noundef zeroext %count_hits) unnamed_addr #3 {
entry:
  %row_term = alloca i16, align 2
  %depth = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 6
  tail call void @llvm.memset.p0.i32(ptr noundef nonnull align 2 dereferenceable(320) %depth, i8 0, i32 320, i1 false)
  %object_count = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 1
  %0 = load i32, ptr %object_count, align 4, !tbaa !18
  %cmp39.not = icmp eq i32 %0, 0
  br i1 %cmp39.not, label %for.cond.cleanup, label %for.body.lr.ph

for.body.lr.ph:                                   ; preds = %entry
  %cmp5 = icmp eq i32 %mode, 1
  %discriminants = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 4
  %conv37 = zext i1 %count_hits to i32
  br label %for.body

for.cond.cleanup:                                 ; preds = %for.cond.cleanup28, %entry
  %hits.0.lcssa = phi i32 [ 0, %entry ], [ %hits.2, %for.cond.cleanup28 ]
  ret i32 %hits.0.lcssa

for.body:                                         ; preds = %for.body.lr.ph, %for.cond.cleanup28
  %hits.041 = phi i32 [ 0, %for.body.lr.ph ], [ %hits.2, %for.cond.cleanup28 ]
  %s.040 = phi i32 [ 0, %for.body.lr.ph ], [ %inc65, %for.cond.cleanup28 ]
  %y1 = getelementptr inbounds [3 x %struct.sphere], ptr %work, i32 0, i32 %s.040, i32 1
  %1 = load i32, ptr %y1, align 4, !tbaa !42
  %sub = sub nsw i32 %y, %1
  call void @llvm.lifetime.start.p0(i64 2, ptr nonnull %row_term) #11
  %radius = getelementptr inbounds [3 x %struct.sphere], ptr %work, i32 0, i32 %s.040, i32 3
  %2 = load i32, ptr %radius, align 4, !tbaa !43
  %add34 = add nsw i32 %2, %sub
  %sub35 = sub nsw i32 %2, %sub
  %sub4 = mul nsw i32 %add34, %sub35
  %conv = trunc i32 %sub4 to i16
  store i16 %conv, ptr %row_term, align 2, !tbaa !34
  br i1 %cmp5, label %if.then, label %for.body14

if.then:                                          ; preds = %for.body
  %arrayidx7 = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 3, i32 %s.040
  call void @raytrace_demo_pie_row(ptr noundef nonnull %arrayidx7, ptr noundef nonnull %row_term, ptr noundef nonnull %discriminants, i32 noundef 20) #11
  br label %if.end

for.body14:                                       ; preds = %for.body, %for.body14
  %x.036 = phi i32 [ %inc, %for.body14 ], [ 0, %for.body ]
  %arrayidx18 = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 3, i32 %s.040, i32 %x.036
  %3 = load i16, ptr %arrayidx18, align 2, !tbaa !34
  %sub20 = sub i16 %conv, %3
  %arrayidx23 = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 4, i32 %x.036
  store i16 %sub20, ptr %arrayidx23, align 2, !tbaa !34
  %inc = add nuw nsw i32 %x.036, 1
  %exitcond.not = icmp eq i32 %inc, 160
  br i1 %exitcond.not, label %if.end, label %for.body14, !llvm.loop !66

if.end:                                           ; preds = %for.body14, %if.then
  %z = getelementptr inbounds [3 x %struct.sphere], ptr %work, i32 0, i32 %s.040, i32 2
  %conv57 = trunc i32 %s.040 to i8
  br label %for.body29

for.cond.cleanup28:                               ; preds = %cleanup
  call void @llvm.lifetime.end.p0(i64 2, ptr nonnull %row_term) #11
  %inc65 = add nuw i32 %s.040, 1
  %4 = load i32, ptr %object_count, align 4, !tbaa !18
  %cmp = icmp ult i32 %inc65, %4
  br i1 %cmp, label %for.body, label %for.cond.cleanup, !llvm.loop !67

for.body29:                                       ; preds = %if.end, %cleanup
  %hits.138 = phi i32 [ %hits.041, %if.end ], [ %hits.2, %cleanup ]
  %x24.037 = phi i32 [ 0, %if.end ], [ %inc61, %cleanup ]
  %arrayidx31 = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 4, i32 %x24.037
  %5 = load i16, ptr %arrayidx31, align 2, !tbaa !34
  %cmp33 = icmp slt i16 %5, 0
  br i1 %cmp33, label %cleanup, label %if.end36

if.end36:                                         ; preds = %for.body29
  %conv32 = zext nneg i16 %5 to i32
  %add = add i32 %hits.138, %conv37
  %6 = load i32, ptr %z, align 4, !tbaa !40
  %arrayidx39 = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 5, i32 %conv32
  %7 = load i8, ptr %arrayidx39, align 1, !tbaa !35
  %conv40 = zext i8 %7 to i32
  %sub41 = sub nsw i32 %6, %conv40
  %conv42 = trunc i32 %sub41 to i16
  %arrayidx44 = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 6, i32 %x24.037
  %8 = load i16, ptr %arrayidx44, align 2, !tbaa !34
  %cmp46 = icmp eq i16 %8, 0
  br i1 %cmp46, label %if.then54, label %lor.lhs.false

lor.lhs.false:                                    ; preds = %if.end36
  %conv45 = sext i16 %8 to i32
  %sext = shl i32 %sub41, 16
  %conv48 = ashr exact i32 %sext, 16
  %cmp52 = icmp slt i32 %conv48, %conv45
  br i1 %cmp52, label %if.then54, label %cleanup

if.then54:                                        ; preds = %lor.lhs.false, %if.end36
  store i16 %conv42, ptr %arrayidx44, align 2, !tbaa !34
  %arrayidx58 = getelementptr inbounds %struct.trace, ptr %work, i32 0, i32 7, i32 %x24.037
  store i8 %conv57, ptr %arrayidx58, align 1, !tbaa !35
  br label %cleanup

cleanup:                                          ; preds = %lor.lhs.false, %if.then54, %for.body29
  %hits.2 = phi i32 [ %hits.138, %for.body29 ], [ %add, %if.then54 ], [ %add, %lor.lhs.false ]
  %inc61 = add nuw nsw i32 %x24.037, 1
  %exitcond42.not = icmp eq i32 %inc61, 160
  br i1 %exitcond42.not, label %for.cond.cleanup28, label %for.body29, !llvm.loop !68
}
