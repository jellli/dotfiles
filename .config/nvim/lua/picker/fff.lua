local M = {}
-- local H = {}
-- H.ns_id = vim.api.nvim_create_namespace("fff-minipick-ui")
M._file_picker = nil

---@param query string[]|nil
function M.match(query)
  query = query or {}
  if not M._file_picker then
    M._file_picker = require("fff.file_picker")
  end
  local file_picker = M._file_picker
  if not file_picker.is_initialized() then
    if not file_picker.setup() then
      vim.notify("Could not setup fff.nvim", vim.log.levels.ERROR)
      return {}
    end
  end
  local ok, items = pcall(file_picker.search_files, table.concat(query), vim.fn.expand("%:."), 35, 4)
  if not ok then
    vim.ui.select({
      "Rebuild",
      "Cancel",
    }, {
      prompt = "Rebuild fff?",
    }, function(_, idx)
      if idx == 1 then
        require("fff.download").download_or_build_binary()
      end
    end)
    return
  end

  return items
end

function M.fff_picker()
  local utils = require("picker.utils")
  local show = utils.createShowFn(function(item)
    local filename = item.name
    return {
      {
        string.format("%s %02d ", "", item.total_frecency_score),
        item.total_frecency_score > 0 and "Special" or "Comment",
      },
      { utils.get_icon(filename) },
      { " " .. vim.fn.fnamemodify(item.path, ":~:.:h") .. "/", "Comment" },
      { filename },
    }
  end)
  MiniPick.start({
    source = {
      name = "FFFiles",
      items = M.match,
      match = function(_, _, query)
        MiniPick.set_picker_items(M.match(query), { do_match = false })
      end,
      show = show,
    },
  })
end

return M
