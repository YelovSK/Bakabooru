namespace Bakabooru.Processing.Pipeline;

public class SearchQuery
{
    public List<string> IncludedTags { get; set; } = new();
    public List<string> ExcludedTags { get; set; } = new();
    // In future: public List<SearchFilter> Filters { get; set; }
}

public static class QueryParser
{
    public static SearchQuery Parse(string query)
    {
        var result = new SearchQuery();
        if (string.IsNullOrWhiteSpace(query)) return result;

        var parts = query.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        foreach (var part in parts)
        {
            if (part.StartsWith('-'))
            {
                var tag = part.TrimStart('-').Trim();
                if (!string.IsNullOrEmpty(tag)) result.ExcludedTags.Add(tag);
            }
            else
            {
                var tag = part.Trim();
                if (!string.IsNullOrEmpty(tag)) result.IncludedTags.Add(tag);
            }
        }

        return result;
    }
}
