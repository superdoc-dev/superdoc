<script setup>
import { formatDate } from './helpers';
import { superdocIcons } from '@superdoc/icons.js';
import { computed, getCurrentInstance } from 'vue';
import { isAllowed, PERMISSIONS } from '@superdoc/core/collaboration/permissions.js';
import { useCommentsStore } from '@superdoc/stores/comments-store';
import Avatar from '@superdoc/components/general/Avatar.vue';
import { useUiFontFamily } from '@superdoc/composables/useUiFontFamily.js';
import CommentsDropdown from './CommentsDropdown.vue';

const emit = defineEmits(['resolve', 'reject', 'overflow-select']);
const commentsStore = useCommentsStore();
const props = defineProps({
  timestamp: {
    type: Number,
    required: false,
  },
  config: {
    type: Object,
    required: true,
  },
  comment: {
    type: Object,
    required: false,
  },
  isPendingInput: {
    type: Boolean,
    required: false,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
});

const { proxy } = getCurrentInstance();
const role = proxy.$superdoc.config.role;
const isInternal = proxy.$superdoc.config.isInternal;
const isOwnComment = props.comment.creatorEmail === proxy.$superdoc.config.user.email;

const { uiFontFamily } = useUiFontFamily();

const OVERFLOW_OPTIONS = Object.freeze({
  edit: { label: 'Edit', key: 'edit' },
  delete: { label: 'Delete', key: 'delete' },
});

const generallyAllowed = computed(() => {
  if (!props.comment) return false;
  if (props.comment.resolvedTime) return false;
  if (commentsStore.pendingComment) return false;
  if (props.isPendingInput) return false;
  return true;
});

const allowResolve = computed(() => {
  if (!generallyAllowed.value) return false;

  // Do not allow child comments to resolve
  if (props.comment.parentCommentId) return false;

  const context = {
    comment: props.comment,
    currentUser: proxy.$superdoc.config.user,
    superdoc: proxy.$superdoc,
  };

  if (isOwnComment || props.comment.trackedChange) {
    return isAllowed(PERMISSIONS.RESOLVE_OWN, role, isInternal, context);
  } else {
    return isAllowed(PERMISSIONS.RESOLVE_OTHER, role, isInternal, context);
  }
});

const allowReject = computed(() => {
  if (!generallyAllowed.value) return false;
  if (!props.comment.trackedChange) return false;

  const context = {
    comment: props.comment,
    currentUser: proxy.$superdoc.config.user,
    superdoc: proxy.$superdoc,
  };

  if (isOwnComment || props.comment.trackedChange) {
    return isAllowed(PERMISSIONS.REJECT_OWN, role, isInternal, context);
  } else {
    return isAllowed(PERMISSIONS.REJECT_OTHER, role, isInternal, context);
  }
});

const allowOverflow = computed(() => {
  if (!generallyAllowed.value) return false;
  if (props.comment.trackedChange) return false;
  if (props.isPendingInput) return false;
  if (getOverflowOptions.value.length === 0) return false;

  return true;
});

const getOverflowOptions = computed(() => {
  if (!generallyAllowed.value) return false;

  const allowedOptions = [];
  const options = new Set();

  // Only the comment creator can edit, and only when comments aren't read-only
  if (!props.config.readOnly && props.comment.creatorEmail === proxy.$superdoc.config.user.email) {
    options.add('edit');
  }

  const isOwnComment = props.comment.creatorEmail === proxy.$superdoc.config.user.email;

  const context = {
    comment: props.comment,
    currentUser: proxy.$superdoc.config.user,
    superdoc: proxy.$superdoc,
  };

  if (isOwnComment && isAllowed(PERMISSIONS.COMMENTS_DELETE_OWN, role, isInternal, context)) {
    options.add('delete');
  } else if (!isOwnComment && isAllowed(PERMISSIONS.COMMENTS_DELETE_OTHER, role, isInternal, context)) {
    options.add('delete');
  }

  options.forEach((option) => allowedOptions.push(OVERFLOW_OPTIONS[option]));
  return allowedOptions;
});

const handleResolve = () => emit('resolve');
const handleReject = () => emit('reject');
const handleSelect = (value) => emit('overflow-select', value);

// Imported comments have `origin` set (e.g. 'word'); imported tracked changes
// don't carry `origin` but do carry `importedAuthor` from the mark attributes.
const isImported = computed(() => {
  return props.comment.origin != null || !!props.comment.importedAuthor?.name;
});

const getCurrentUser = computed(() => {
  if (props.isPendingInput) return proxy.$superdoc.config.user;
  const user = props.comment.getCommentUser();
  // Strip "(imported)" qualifier from display name — the imported tag handles origin indication
  if (user?.name) {
    const cleaned = user.name.replace(/\s*\(imported\)\s*/gi, '').trim();
    if (cleaned) return { ...user, name: cleaned };
  }
  return user;
});
</script>

<template>
  <div class="card-section comment-header">
    <div class="comment-header-left">
      <Avatar :user="getCurrentUser" class="avatar" />
      <div class="user-info">
        <div class="user-name">
          {{ getCurrentUser.name }}<span v-if="isImported" class="imported-tag">IMPORTED</span>
        </div>
        <div class="user-timestamp" v-if="props.comment.createdTime">{{ formatDate(props.comment.createdTime) }}</div>
      </div>
    </div>

    <!-- Action buttons — visible on card hover and when active -->
    <div class="overflow-menu" :class="{ 'is-visible': props.isActive }">
      <div
        v-if="allowResolve"
        class="overflow-menu__icon"
        v-html="superdocIcons.markDone"
        @click.stop.prevent="handleResolve"
      ></div>

      <div
        v-if="allowReject"
        class="overflow-menu__icon"
        v-html="superdocIcons.rejectChange"
        @click.stop.prevent="handleReject"
      ></div>

      <CommentsDropdown
        v-if="allowOverflow"
        :options="getOverflowOptions"
        @select="handleSelect"
        :content-style="{ fontFamily: uiFontFamily }"
      >
        <div class="overflow-menu__icon">
          <div class="overflow-icon" v-html="superdocIcons.overflow"></div>
        </div>
      </CommentsDropdown>
    </div>
  </div>
</template>

<style scoped>
.comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.comment-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-info {
  display: flex;
  flex-direction: column;
}
.user-name {
  font-size: var(--sd-ui-comments-author-size, 14px);
  font-weight: var(--sd-ui-comments-author-weight, 600);
  color: var(--sd-ui-comments-author-text, #212121);
  line-height: 1.2em;
}
.imported-tag {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sd-ui-comments-tag-text, #888888);
  background: var(--sd-ui-comments-tag-bg, #f2f2f2);
  border-radius: 3px;
  padding: 1px 4px;
  margin-left: 6px;
  vertical-align: middle;
  line-height: 1.4;
}
.user-timestamp {
  line-height: 1.2em;
  font-size: var(--sd-ui-comments-timestamp-size, 12px);
  color: var(--sd-ui-comments-timestamp-text, #888888);
}
.overflow-menu {
  flex-shrink: 1;
  display: flex;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease;
}
.overflow-menu.is-visible {
  opacity: 1;
  pointer-events: auto;
}
.overflow-menu__icon {
  display: flex;
  box-sizing: content-box;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  padding: 3px;
  border-radius: 50%;
  color: var(--sd-ui-text, #47484a);
  cursor: pointer;
  transition: all 250ms ease;
}
.overflow-menu__icon:hover {
  background-color: var(--sd-ui-comments-separator, #dbdbdb);
}
.overflow-menu__icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  fill: currentColor;
}
.overflow-icon {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  width: 10px;
  height: 16px;
}
</style>
